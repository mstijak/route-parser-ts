/**
 * Route Parser - A TypeScript URL routing library
 * Supports named parameters (:param), splats (*param), and optional segments (())
 */

// Token types for the route specification
type TokenType = 'static' | 'param' | 'splat' | 'optional';

interface Token {
  type: TokenType;
  value: string;
  children?: Token[]; // For optional segments
}

// Parameters object type
export interface RouteParams {
  [key: string]: string | number | undefined;
}

/**
 * Parse a route specification into tokens
 */
function tokenize(spec: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < spec.length) {
    const char = spec[i];

    if (char === ':') {
      // Named parameter
      i++;
      let name = '';
      while (i < spec.length && /[\w]/.test(spec[i])) {
        name += spec[i];
        i++;
      }
      if (name) {
        tokens.push({ type: 'param', value: name });
      }
    } else if (char === '*') {
      // Splat parameter
      i++;
      let name = '';
      while (i < spec.length && /[\w]/.test(spec[i])) {
        name += spec[i];
        i++;
      }
      if (name) {
        tokens.push({ type: 'splat', value: name });
      }
    } else if (char === '(') {
      // Optional segment - find matching closing paren
      i++;
      let depth = 1;
      let optionalContent = '';
      while (i < spec.length && depth > 0) {
        if (spec[i] === '(') depth++;
        else if (spec[i] === ')') depth--;
        if (depth > 0) {
          optionalContent += spec[i];
        }
        i++;
      }
      // Recursively parse the optional content
      const children = tokenize(optionalContent);
      tokens.push({ type: 'optional', value: optionalContent, children });
    } else {
      // Static text - consume until we hit a special character
      let text = '';
      while (i < spec.length && !':*()'.includes(spec[i])) {
        text += spec[i];
        i++;
      }
      if (text) {
        tokens.push({ type: 'static', value: text });
      }
    }
  }

  return tokens;
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a regex pattern from tokens
 */
function buildRegex(tokens: Token[]): { pattern: string; paramNames: string[] } {
  let pattern = '';
  const paramNames: string[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'static':
        pattern += escapeRegex(token.value);
        break;
      case 'param':
        // Named parameter matches one path segment (no slashes)
        pattern += '([^/]+)';
        paramNames.push(token.value);
        break;
      case 'splat':
        // Splat matches any characters including slashes (non-greedy within constraints)
        pattern += '(.+?)';
        paramNames.push(token.value);
        break;
      case 'optional':
        // Optional segment - recursively build and wrap in optional group
        if (token.children) {
          const { pattern: childPattern, paramNames: childNames } = buildRegex(token.children);
          pattern += `(?:${childPattern})?`;
          paramNames.push(...childNames);
        }
        break;
    }
  }

  return { pattern, paramNames };
}

/**
 * Attempt to reverse a route with given parameters
 */
function reverseTokens(tokens: Token[], params: RouteParams): string | false {
  let result = '';

  for (const token of tokens) {
    switch (token.type) {
      case 'static':
        result += token.value;
        break;
      case 'param':
      case 'splat': {
        const value = params[token.value];
        if (value === undefined || value === null || value === '') {
          return false;
        }
        result += String(value);
        break;
      }
      case 'optional':
        if (token.children) {
          // Try to fill the optional segment
          const optionalResult = reverseTokens(token.children, params);
          if (optionalResult !== false) {
            result += optionalResult;
          }
          // If it fails, just skip the optional part (don't return false)
        }
        break;
    }
  }

  return result;
}

/**
 * Check if tokens can be fulfilled with the given params
 */
function canFulfill(tokens: Token[], params: RouteParams): boolean {
  for (const token of tokens) {
    if (token.type === 'param' || token.type === 'splat') {
      const value = params[token.value];
      if (value === undefined || value === null || value === '') {
        return false;
      }
    } else if (token.type === 'optional' && token.children) {
      // Optional segments don't need to be fulfilled
      continue;
    }
  }
  return true;
}

/**
 * RouteParser class
 */
class RouteParser {
  public spec: string;
  private tokens: Token[];
  private regex: RegExp;
  private paramNames: string[];

  constructor(spec: string) {
    if (!spec) {
      throw new Error('spec is required');
    }

    this.spec = spec;
    this.tokens = tokenize(spec);

    const { pattern, paramNames } = buildRegex(this.tokens);
    // Match from start to end, with optional query string
    this.regex = new RegExp(`^${pattern}(?:\\?.*)?$`);
    this.paramNames = paramNames;
  }

  /**
   * Match a path against this route
   * Returns params object on match, false otherwise
   */
  match(path: string): RouteParams | false {
    const match = this.regex.exec(path);
    if (!match) {
      return false;
    }

    const params: RouteParams = {};
    for (let i = 0; i < this.paramNames.length; i++) {
      params[this.paramNames[i]] = match[i + 1];
    }

    return params;
  }

  /**
   * Reverse the route with given parameters
   * Returns the path string on success, false otherwise
   */
  reverse(params: RouteParams = {}): string | false {
    // Check if required (non-optional) params can be fulfilled
    if (!this.canFulfillRequired(this.tokens, params)) {
      return false;
    }

    return reverseTokens(this.tokens, params);
  }

  /**
   * Check if required params (non-optional) can be fulfilled
   */
  private canFulfillRequired(tokens: Token[], params: RouteParams): boolean {
    for (const token of tokens) {
      if (token.type === 'param' || token.type === 'splat') {
        const value = params[token.value];
        if (value === undefined || value === null || value === '') {
          return false;
        }
      }
      // Optional segments don't need to be checked at top level
    }
    return true;
  }
}

// Factory function that allows calling with or without 'new'
interface RouteParserConstructor {
  new (spec: string): RouteParser;
  (spec: string): RouteParser;
}

const RouteParserFactory = function(this: RouteParser | void, spec: string): RouteParser {
  if (this instanceof RouteParser) {
    // Called with 'new'
    return new RouteParser(spec);
  }
  // Called without 'new'
  return new RouteParser(spec);
} as unknown as RouteParserConstructor;

// Set the prototype so instanceof works
RouteParserFactory.prototype = RouteParser.prototype;

// Re-implement to allow both calling conventions
function createRouteParser(spec: string): RouteParser {
  return new RouteParser(spec);
}

// Export a wrapper that supports both calling conventions
const Route = function(this: any, spec: string): RouteParser {
  if (!(this instanceof Route)) {
    return new Route(spec);
  }

  if (!spec) {
    throw new Error('spec is required');
  }

  const parser = new RouteParser(spec);

  // Copy properties to this instance
  (this as any).spec = parser.spec;
  (this as any).match = parser.match.bind(parser);
  (this as any).reverse = parser.reverse.bind(parser);

  return this;
} as unknown as RouteParserConstructor;

// Ensure prototype chain works for instanceof
Route.prototype = Object.create(Object.prototype);
Route.prototype.constructor = Route;

export default Route;
export { Route, RouteParser };
