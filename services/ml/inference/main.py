"""
EcoLens ML inference service (Member C).

Two-stage Australian-wildlife pipeline, mirroring notebooks/batch.py:
  1. MegaDetector (mdv5a.pt)  -> finds WHERE animals are (bounding boxes)
  2. SpeciesNet  (model.pt)   -> classifies WHAT each cropped animal is

Runs as a FastAPI app on Cloud Run. Endpoints:
  GET  /health  -> liveness, no auth
  POST /infer   -> requires a Cognito JWT; returns {"counts": {species: int}}

Model files are downloaded from GCS at startup (NOT baked into the image), so a
new model can be deployed by changing an env var only -- this is the
"model swap mechanism" required by the assignment (section 4.1).
"""

import io
import os
import logging
from collections import Counter

import numpy as np
from PIL import Image
from fastapi import FastAPI, UploadFile, File, Header, HTTPException

logging.basicConfig(level=logging.INFO)
log = logging.getLogger("ecolens-infer")

# --------------------------------------------------------------------------
# Configuration (all overridable via Cloud Run env vars)
# --------------------------------------------------------------------------
GCS_BUCKET      = os.environ.get("GCS_BUCKET", "")
MODEL_VERSION   = os.environ.get("MODEL_VERSION", "v1")
# Keys default to "<version>/<file>"; can be overridden individually.
CLASSIFIER_KEY  = os.environ.get("CLASSIFIER_KEY", f"{MODEL_VERSION}/model.pt")
DETECTOR_KEY    = os.environ.get("DETECTOR_KEY",   f"{MODEL_VERSION}/mdv5a.pt")

DETECT_CONF     = float(os.environ.get("DETECT_CONF", "0.2"))     # min MegaDetector box conf
CLASSIFY_CONF   = float(os.environ.get("CLASSIFY_CONF", "0.3"))   # min SpeciesNet conf to count
DETECT_CATEGORY = "1"  # MegaDetector category "1" == animal (2=person, 3=vehicle)

# Cognito (JWT verification) -- the only auth code in the whole project
COGNITO_REGION        = os.environ.get("COGNITO_REGION", "us-east-1")
COGNITO_USER_POOL_ID  = os.environ.get("COGNITO_USER_POOL_ID", "")
COGNITO_APP_CLIENT_ID = os.environ.get("COGNITO_APP_CLIENT_ID", "")
# Dev-only escape hatch: lets Member B test the pipeline before Cognito exists.
# MUST be "false" (default) for the marked submission.
AUTH_DISABLED = os.environ.get("AUTH_DISABLED", "false").lower() == "true"

LOCAL_DIR = "/tmp"  # Cloud Run's only writable dir

# SpeciesNet output index -> scientific name. ORDER MATTERS: it must match the
# trained model's class order exactly (copied verbatim from notebooks/batch.py).
CLASSES = [
    'Alectura_lathami', 'Antechinus_agilis', 'Bos_taurus', 'Burhinus_grallarius',
    'Canis_familiaris', 'Chalcophaps_longirostris', 'Colluricincla_harmonica',
    'Corcorax_melanorhamphos', 'Dacelo_novaeguineae', 'Dama_dama', 'Eopsaltria_australis',
    'Felis_catus', 'Geopelia_humeralis', 'Gymnorhina_tibicen', 'Homo_sapiens',
    'Isoodon_macrourus', 'Lepus_europaeus', 'Macropus_giganteus', 'Menura_novaehollandiae',
    'Mus_musculus', 'Oryctolagus_cuniculus', 'Perameles_nasuta', 'Pitta_versicolor',
    'Rattus', 'Rattus_fuscipes', 'Rattus_rattus', 'Strepera_graculina', 'Sus_scrofa',
    'Tachyglossus_aculeatus', 'Thylogale_stigmatica', 'Trichosurus_caninus',
    'Trichosurus_cunninghami', 'Trichosurus_vulpecula', 'Varanus_varius',
    'Vombatus_ursinus', 'Vulpes_vulpes', 'Wallabia_bicolor', 'Canis_dingo',
    'Capra_hircus', 'Casuarius_casuarius', 'Heteromyias_cinereifrons',
    'Hypsiprymnodon_moschatus', 'Megapodius_reinwardt', 'Notamacropus_rufogriseus',
    'Orthonyx_spaldingii', 'Uromys_caudimaculatus',
]

# Globals populated once at startup (warm container reuses them)
_detector = None     # MegaDetector
_classifier = None   # SpeciesNet (torch)
_transform = None    # torchvision transform
_torch = None
_jwk_client = None
_class_to_tag = {}   # "Vombatus_ursinus" -> "common wombat"

app = FastAPI(title="EcoLens ML Inference")


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------
def _download_from_gcs(key: str, dest: str) -> str:
    """Download gs://<GCS_BUCKET>/<key> to <dest> if not already present."""
    if os.path.exists(dest):
        return dest
    from google.cloud import storage
    log.info("Downloading gs://%s/%s -> %s", GCS_BUCKET, key, dest)
    client = storage.Client()
    client.bucket(GCS_BUCKET).blob(key).download_to_filename(dest)
    log.info("Downloaded %s (%d bytes)", dest, os.path.getsize(dest))
    return dest


def _build_class_to_tag() -> dict:
    """Map each model class (scientific name) to a human tag (common name).

    Uses labels.txt (shipped in the image) as the single source of truth:
    each line is  uuid;class;order;family;genus;species;common_name
    """
    mapping = {}
    labels_path = os.path.join(os.path.dirname(__file__), "labels.txt")
    by_genus_species = {}
    by_genus = {}
    try:
        with open(labels_path) as f:
            for line in f:
                parts = [p.strip() for p in line.strip().split(";")]
                if len(parts) < 7:
                    continue
                genus, species, common = parts[4], parts[5], parts[6]
                if common:
                    if genus and species:
                        by_genus_species[f"{genus}_{species}".lower()] = common.lower()
                    if genus:
                        by_genus.setdefault(genus.lower(), common.lower())
    except FileNotFoundError:
        log.warning("labels.txt not found; tags will be scientific names")

    for c in CLASSES:
        key = c.lower()
        genus = key.split("_")[0]
        mapping[c] = (
            by_genus_species.get(key)
            or by_genus.get(genus)
            or c.lower().replace("_", " ")
        )
    return mapping


def _load_models():
    """Load detector + classifier once. Called lazily on first use / startup."""
    global _detector, _classifier, _transform, _torch, _class_to_tag

    if not GCS_BUCKET:
        raise RuntimeError("GCS_BUCKET env var is not set")

    import torch
    import torchvision.transforms as transforms
    from megadetector.detection.run_detector import load_detector
    _torch = torch

    det_path = _download_from_gcs(DETECTOR_KEY,   os.path.join(LOCAL_DIR, "mdv5a.pt"))
    cls_path = _download_from_gcs(CLASSIFIER_KEY, os.path.join(LOCAL_DIR, "model.pt"))

    log.info("Loading MegaDetector...")
    _detector = load_detector(det_path)

    log.info("Loading SpeciesNet classifier...")
    _classifier = torch.load(cls_path, map_location="cpu", weights_only=False)
    _classifier.eval()

    # Same preprocessing as batch.py
    _transform = transforms.Compose([
        transforms.Resize((480, 480)),
        transforms.ToTensor(),
    ])

    _class_to_tag = _build_class_to_tag()
    log.info("Models ready. %d species classes.", len(CLASSES))


def _classify_crop(crop: Image.Image) -> tuple[str, float]:
    """Run SpeciesNet on one cropped PIL image -> (tag, confidence)."""
    torch = _torch
    with torch.no_grad():
        x = _transform(crop)            # C,H,W
        x = x.unsqueeze(0)              # B,C,H,W
        x = x.permute(0, 2, 3, 1)       # B,H,W,C  (this model expects NHWC)
        logits = _classifier(x)
        probs = torch.softmax(logits, dim=1)[0].cpu().numpy()
    idx = int(np.argmax(probs))
    return _class_to_tag[CLASSES[idx]], float(probs[idx])


def _count_species(image_bytes: bytes) -> dict:
    """Full pipeline on one image -> {tag: count}."""
    img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    W, H = img.size

    result = _detector.generate_detections_one_image(
        img, image_id="query", detection_threshold=DETECT_CONF
    )
    counts = Counter()
    for det in result.get("detections", []):
        if det.get("category") != DETECT_CATEGORY:
            continue
        if det.get("conf", 0) < DETECT_CONF:
            continue
        x, y, w, h = det["bbox"]  # normalised [x_min, y_min, width, height]
        crop = img.crop((int(x * W), int(y * H), int((x + w) * W), int((y + h) * H)))
        tag, conf = _classify_crop(crop)
        if conf >= CLASSIFY_CONF:
            counts[tag] += 1
    return dict(counts)


def _verify_jwt(authorization: str | None):
    """Validate a Cognito JWT from the Authorization header. Raises 401 if bad."""
    if AUTH_DISABLED:
        log.warning("AUTH_DISABLED=true -- skipping JWT verification (dev only)")
        return {"sub": "dev"}

    if not COGNITO_USER_POOL_ID or not COGNITO_APP_CLIENT_ID:
        raise HTTPException(503, "Auth not configured (COGNITO_* env vars missing)")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Missing Bearer token")

    token = authorization.split(" ", 1)[1]
    import jwt
    issuer = f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/{COGNITO_USER_POOL_ID}"
    try:
        signing_key = _jwk_client.get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token, signing_key, algorithms=["RS256"], issuer=issuer,
            options={"verify_aud": False},  # checked manually below (id vs access token)
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(401, f"Invalid token: {e}")

    # ID tokens carry "aud"; access tokens carry "client_id". Accept either.
    aud = claims.get("aud") or claims.get("client_id")
    if aud != COGNITO_APP_CLIENT_ID:
        raise HTTPException(401, "Token audience/client_id mismatch")
    return claims


# --------------------------------------------------------------------------
# Lifecycle + routes
# --------------------------------------------------------------------------
@app.on_event("startup")
def _startup():
    global _jwk_client
    if COGNITO_USER_POOL_ID:
        from jwt import PyJWKClient
        url = (f"https://cognito-idp.{COGNITO_REGION}.amazonaws.com/"
               f"{COGNITO_USER_POOL_ID}/.well-known/jwks.json")
        _jwk_client = PyJWKClient(url)
    try:
        _load_models()
    except Exception as e:  # noqa: BLE001
        # Don't crash the container; /health stays up, /infer reports the error.
        log.exception("Model load failed at startup: %s", e)


@app.get("/health")
def health():
    return {"ok": True, "models_loaded": _classifier is not None,
            "model_version": MODEL_VERSION}


@app.post("/infer")
async def infer(file: UploadFile = File(...),
                authorization: str | None = Header(default=None)):
    _verify_jwt(authorization)
    if _classifier is None or _detector is None:
        _load_models()  # retry if startup load failed
    image_bytes = await file.read()
    try:
        counts = _count_species(image_bytes)
    except Exception as e:  # noqa: BLE001
        log.exception("Inference failed")
        raise HTTPException(500, f"Inference error: {e}")
    return {"counts": counts, "model_version": MODEL_VERSION}
