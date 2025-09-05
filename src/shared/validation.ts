import { ValidationResult } from "./types";

export interface JSONSchema {
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  items?: JSONSchema;
  enum?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  additionalProperties?: boolean | JSONSchema;
}

export function validateToolArgs(args: unknown, schema: JSONSchema): ValidationResult {
  const errors: string[] = [];

  try {
    validateValue(args, schema, 'root', errors);
  } catch (error) {
    errors.push(`Validation error: ${(error as Error).message}`);
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

function validateValue(value: unknown, schema: JSONSchema, path: string, errors: string[]): void {
  // Type validation
  if (schema.type) {
    const actualType = getActualType(value);
    if (actualType !== schema.type) {
      errors.push(`${path}: expected ${schema.type}, got ${actualType}`);
      return; // Skip further validation if type is wrong
    }
  }

  switch (schema.type) {
    case 'object':
      validateObject(value as Record<string, unknown>, schema, path, errors);
      break;
    case 'array':
      validateArray(value as unknown[], schema, path, errors);
      break;
    case 'string':
      validateString(value as string, schema, path, errors);
      break;
    case 'number':
    case 'integer':
      validateNumber(value as number, schema, path, errors);
      break;
  }

  // Enum validation
  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${path}: value must be one of ${schema.enum.join(', ')}`);
  }
}

function validateObject(obj: Record<string, unknown>, schema: JSONSchema, path: string, errors: string[]): void {
  if (obj === null || typeof obj !== 'object') {
    errors.push(`${path}: expected object, got ${typeof obj}`);
    return;
  }

  // Required properties
  if (schema.required) {
    for (const requiredProp of schema.required) {
      if (!(requiredProp in obj)) {
        errors.push(`${path}: missing required property '${requiredProp}'`);
      }
    }
  }

  // Property validation
  if (schema.properties) {
    for (const [propName, propSchema] of Object.entries(schema.properties)) {
      if (propName in obj) {
        validateValue(obj[propName], propSchema, `${path}.${propName}`, errors);
      }
    }
  }

  // Additional properties
  if (schema.additionalProperties === false) {
    const allowedProps = new Set(Object.keys(schema.properties || {}));
    for (const propName of Object.keys(obj)) {
      if (!allowedProps.has(propName)) {
        errors.push(`${path}: unexpected property '${propName}'`);
      }
    }
  } else if (typeof schema.additionalProperties === 'object') {
    const allowedProps = new Set(Object.keys(schema.properties || {}));
    for (const [propName, propValue] of Object.entries(obj)) {
      if (!allowedProps.has(propName)) {
        validateValue(propValue, schema.additionalProperties, `${path}.${propName}`, errors);
      }
    }
  }
}

function validateArray(arr: unknown[], schema: JSONSchema, path: string, errors: string[]): void {
  if (!Array.isArray(arr)) {
    errors.push(`${path}: expected array, got ${typeof arr}`);
    return;
  }

  if (schema.items) {
    for (let i = 0; i < arr.length; i++) {
      validateValue(arr[i], schema.items, `${path}[${i}]`, errors);
    }
  }
}

function validateString(str: string, schema: JSONSchema, path: string, errors: string[]): void {
  if (typeof str !== 'string') {
    errors.push(`${path}: expected string, got ${typeof str}`);
    return;
  }

  if (schema.minLength !== undefined && str.length < schema.minLength) {
    errors.push(`${path}: string too short (minimum ${schema.minLength} characters)`);
  }

  if (schema.maxLength !== undefined && str.length > schema.maxLength) {
    errors.push(`${path}: string too long (maximum ${schema.maxLength} characters)`);
  }

  if (schema.pattern) {
    const regex = new RegExp(schema.pattern);
    if (!regex.test(str)) {
      errors.push(`${path}: string does not match pattern ${schema.pattern}`);
    }
  }
}

function validateNumber(num: number, schema: JSONSchema, path: string, errors: string[]): void {
  if (typeof num !== 'number' || isNaN(num)) {
    errors.push(`${path}: expected number, got ${typeof num}`);
    return;
  }

  if (schema.type === 'integer' && !Number.isInteger(num)) {
    errors.push(`${path}: expected integer, got float`);
  }

  if (schema.minimum !== undefined && num < schema.minimum) {
    errors.push(`${path}: number too small (minimum ${schema.minimum})`);
  }

  if (schema.maximum !== undefined && num > schema.maximum) {
    errors.push(`${path}: number too large (maximum ${schema.maximum})`);
  }
}

function getActualType(value: unknown): string {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

// Input sanitization utilities
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, '') // Remove potential HTML tags
    .replace(/javascript:/gi, '') // Remove javascript: protocols
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim();
}

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9.\-_]/g, '_') // Replace unsafe characters
    .replace(/^\.+/, '') // Remove leading dots
    .substring(0, 255); // Limit length
}

export function validateUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return ['http:', 'https:'].includes(parsedUrl.protocol);
  } catch {
    return false;
  }
}

export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

// Security validation for MCP server configurations
export function validateMCPServerConfig(server: any): ValidationResult {
  const errors: string[] = [];

  // Required fields
  if (!server.name || typeof server.name !== 'string') {
    errors.push('Server name is required and must be a string');
  }

  if (!server.type || !['stdio', 'sse', 'streamableHttp', 'inMemory'].includes(server.type)) {
    errors.push('Server type must be one of: stdio, sse, streamableHttp, inMemory');
  }

  // Validate based on server type
  if (server.type === 'stdio') {
    if (!server.command || typeof server.command !== 'string') {
      errors.push('Command is required for stdio servers');
    }

    // Security: Validate command path
    if (server.command && server.command.includes('..')) {
      errors.push('Command path cannot contain parent directory references (..)');
    }

    if (server.args && !Array.isArray(server.args)) {
      errors.push('Arguments must be an array');
    }

    if (server.env && typeof server.env !== 'object') {
      errors.push('Environment variables must be an object');
    }
  } else if (['sse', 'streamableHttp'].includes(server.type)) {
    if (!server.baseUrl || typeof server.baseUrl !== 'string') {
      errors.push('Base URL is required for URL-based servers');
    }

    if (server.baseUrl && !validateUrl(server.baseUrl)) {
      errors.push('Base URL must be a valid HTTP/HTTPS URL');
    }

    // Security: Only allow HTTPS in production
    if (server.baseUrl && server.baseUrl.startsWith('http:') && process.env.NODE_ENV === 'production') {
      errors.push('Only HTTPS URLs are allowed in production');
    }

    if (server.headers && typeof server.headers !== 'object') {
      errors.push('Headers must be an object');
    }
  }

  // Common validations
  if (server.timeout !== undefined && (typeof server.timeout !== 'number' || server.timeout <= 0)) {
    errors.push('Timeout must be a positive number');
  }

  if (server.disabledTools !== undefined && !Array.isArray(server.disabledTools)) {
    errors.push('Disabled tools must be an array');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}

// API key validation
export function validateApiKey(providerId: string, apiKey: string): ValidationResult {
  const errors: string[] = [];

  if (!apiKey || typeof apiKey !== 'string') {
    errors.push('API key is required and must be a string');
    return { isValid: false, errors };
  }

  // Provider-specific validation
  const validationRules: Record<string, { pattern: RegExp; description: string }> = {
    openai: {
      pattern: /^sk-[A-Za-z0-9]{48,}$/,
      description: 'OpenAI API key must start with sk- followed by at least 48 characters',
    },
    anthropic: {
      pattern: /^sk-ant-[A-Za-z0-9\-_]{40,}$/,
      description: 'Anthropic API key must start with sk-ant- followed by at least 40 characters',
    },
    gemini: {
      pattern: /^[A-Za-z0-9\-_]{39}$/,
      description: 'Google API key must be exactly 39 characters long',
    },
    deepseek: {
      pattern: /^sk-[A-Za-z0-9]{48,}$/,
      description: 'DeepSeek API key must start with sk- followed by at least 48 characters',
    },
  };

  const rule = validationRules[providerId];
  if (rule && !rule.pattern.test(apiKey)) {
    errors.push(rule.description);
  }

  // Security checks
  if (apiKey.length < 20) {
    errors.push('API key is too short (minimum 20 characters)');
  }

  if (apiKey.includes(' ')) {
    errors.push('API key cannot contain spaces');
  }

  // Check for common test/placeholder keys
  const invalidKeys = ['test', 'placeholder', 'your-api-key', 'sk-test', 'sk-fake'];
  const lowerKey = apiKey.toLowerCase();
  if (invalidKeys.some(invalid => lowerKey.includes(invalid))) {
    errors.push('API key appears to be a placeholder or test key');
  }

  return {
    isValid: errors.length === 0,
    errors,
  };
}