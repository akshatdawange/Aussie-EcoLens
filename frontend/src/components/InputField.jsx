import React, { useState } from 'react';
import './InputField.css';

const InputField = ({
  label,
  type = 'text',
  placeholder,
  value,
  onChange,
  error,
  hint,
  required = false,
  disabled = false,
  className = '',
  ...props
}) => {
  const [showPassword, setShowPassword] = useState(false);
  const isPassword = type === 'password';
  const inputType = isPassword ? (showPassword ? 'text' : 'password') : type;

  return (
    <div className={`input-group ${error ? 'input-group--error' : ''} ${className}`}>
      {label && (
        <label className="input-label">
          {label}
          {required && <span className="input-required">*</span>}
        </label>
      )}
      <div className="input-wrapper">
        <input
          type={inputType}
          className={`input-field ${isPassword ? 'input-field--has-toggle' : ''}`}
          placeholder={placeholder}
          value={value}
          onChange={onChange}
          disabled={disabled}
          required={required}
          {...props}
        />
        {isPassword && (
          <button
            type="button"
            className="input-toggle"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? '○' : '●'}
          </button>
        )}
      </div>
      {error && <p className="input-error">{error}</p>}
      {hint && !error && <p className="input-hint">{hint}</p>}
    </div>
  );
};

export default InputField;