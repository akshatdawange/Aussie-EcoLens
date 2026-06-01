from fastapi import FastAPI

app = FastAPI()

@app.get("/")
def root():
    return {"message": "hello from C"}

@app.get("/health")
def health():
    return {"ok": True}
