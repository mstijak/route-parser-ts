/**
 * Route Parser - A TypeScript URL routing library
 * Supports named parameters (:param), splats (*param), and optional segments (())
 */

// Token types for the route specification
type TokenType = 'static' | 'param' | 'splat' | 'optional' | 'querySeparator';

interface Token {
  type: TokenType;
  value: string;
  children?: Token[]; // For optional segments
}

// Parameters object type
export interface RouteParams {
  [key: string]: string | number | undefined;
}

// Query parameter definition extracted from route spec
interface QueryParamDef {
  name: string;       // Parameter name (e.g., 'page')
  key: string;        // Query key (e.g., 'page' from 'page=:page')
  optional: boolean;  // Whether this param is inside optional segment
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
    } else if (char === '?' || char === '&') {
      // Query separator - mark it specially
      tokens.push({ type: 'querySeparator', value: char });
      i++;
    } else {
      // Static text - consume until we hit a special character
      let text = '';
      while (i < spec.length && !':*()&?'.includes(spec[i])) {
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
 * Check if tokens contain any query-related content (? or &)
 */
function hasQueryTokens(tokens: Token[]): boolean {
  for (const token of tokens) {
    if (token.type === 'querySeparator') return true;
    if (token.type === 'optional' && token.children && hasQueryTokens(token.children)) return true;
  }
  return false;
}

/**
 * Extract query parameter definitions from tokens
 */
function extractQueryParams(tokens: Token[], optional: boolean = false): QueryParamDef[] {
  const params: QueryParamDef[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'param') {
      // Look back for the key name (e.g., 'page=' before ':page')
      let key = token.value; // Default to param name
      if (i > 0) {
        const prevToken = tokens[i - 1];
        if (prevToken.type === 'static' && prevToken.value.endsWith('=')) {
          // Extract key from "key="
          const match = prevToken.value.match(/([^=&?]+)=$/);
          if (match) {
            key = match[1];
          }
        }
      }
      params.push({ name: token.value, key, optional });
    } else if (token.type === 'optional' && token.children) {
      // Recursively extract from optional segments
      params.push(...extractQueryParams(token.children, true));
    }
  }

  return params;
}

/**
 * Split tokens into path tokens and query tokens
 */
function splitPathAndQuery(tokens: Token[]): { pathTokens: Token[]; queryTokens: Token[] } {
  const pathTokens: Token[] = [];
  const queryTokens: Token[] = [];
  let inQuery = false;

  for (const token of tokens) {
    if (token.type === 'querySeparator' && token.value === '?') {
      inQuery = true;
      queryTokens.push(token);
    } else if (inQuery) {
      queryTokens.push(token);
    } else if (token.type === 'optional' && token.children) {
      // Check if this optional contains query content
      if (hasQueryTokens(token.children)) {
        // This optional is part of query
        queryTokens.push(token);
        inQuery = true; // After query optional, we're in query mode
      } else {
        pathTokens.push(token);
      }
    } else {
      pathTokens.push(token);
    }
  }

  return { pathTokens, queryTokens };
}

/**
 * Escape special regex characters in a string
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Build a regex pattern from path tokens only (no query handling)
 */
function buildPathRegex(tokens: Token[]): { pattern: string; paramNames: string[] } {
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
          const { pattern: childPattern, paramNames: childNames } = buildPathRegex(token.children);
          pattern += `(?:${childPattern})?`;
          paramNames.push(...childNames);
        }
        break;
      case 'querySeparator':
        // Should not appear in path tokens
        break;
    }
  }

  return { pattern, paramNames };
}

/**
 * Parse a query string into key-value pairs
 */
function parseQueryString(queryString: string): Map<string, string> {
  const params = new Map<string, string>();
  if (!queryString) return params;

  // Remove leading ? if present
  const qs = queryString.startsWith('?') ? queryString.slice(1) : queryString;
  if (!qs) return params;

  for (const pair of qs.split('&')) {
    const [key, value] = pair.split('=');
    if (key) {
      params.set(key, value || '');
    }
  }

  return params;
}

/**
 * Attempt to reverse a route with given parameters
 */
function reverseTokens(tokens: Token[], params: RouteParams, isFirstQueryParam: { value: boolean }): string | false {
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
      case 'querySeparator':
        // For reverse, we handle ? and & smartly
        if (token.value === '?') {
          if (isFirstQueryParam.value) {
            result += '?';
            isFirstQueryParam.value = false;
          } else {
            result += '&';
          }
        } else if (token.value === '&') {
          if (isFirstQueryParam.value) {
            result += '?';
            isFirstQueryParam.value = false;
          } else {
            result += '&';
          }
        }
        break;
      case 'optional':
        if (token.children) {
          // Try to fill the optional segment
          const optionalResult = reverseTokens(token.children, params, isFirstQueryParam);
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
  private pathRegex: RegExp;
  private pathParamNames: string[];
  private queryParamDefs: QueryParamDef[];
  private hasQueryInSpec: boolean;

  constructor(spec: string) {
    if (!spec) {
      throw new Error('spec is required');
    }

    this.spec = spec;
    this.tokens = tokenize(spec);

    // Split into path and query parts
    const { pathTokens, queryTokens } = splitPathAndQuery(this.tokens);

    // Build regex for path part only
    const { pattern, paramNames } = buildPathRegex(pathTokens);
    this.pathRegex = new RegExp(`^${pattern}(?:\\?.*)?$`);
    this.pathParamNames = paramNames;

    // Extract query parameter definitions
    this.queryParamDefs = extractQueryParams(queryTokens);
    this.hasQueryInSpec = queryTokens.length > 0;
  }

  /**
   * Match a path against this route
   * Returns params object on match, false otherwise
   */
  match(path: string): RouteParams | false {
    // Split path into pathname and query string
    const queryIndex = path.indexOf('?');
    const pathname = queryIndex >= 0 ? path.slice(0, queryIndex) : path;
    const queryString = queryIndex >= 0 ? path.slice(queryIndex + 1) : '';

    // Match only the pathname part (not query string) to avoid capturing ? in params
    const match = this.pathRegex.exec(pathname);
    if (!match) {
      return false;
    }

    const params: RouteParams = {};

    // Extract path parameters
    for (let i = 0; i < this.pathParamNames.length; i++) {
      params[this.pathParamNames[i]] = match[i + 1];
    }

    // If route has query params in spec, match them from URL's query string
    if (this.hasQueryInSpec) {
      const urlQueryParams = parseQueryString(queryString);

      for (const paramDef of this.queryParamDefs) {
        const value = urlQueryParams.get(paramDef.key);
        if (value !== undefined) {
          params[paramDef.name] = value;
        } else if (paramDef.optional) {
          params[paramDef.name] = undefined;
        } else {
          // Required query param not found
          return false;
        }
      }
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

    const isFirstQueryParam = { value: true };
    return reverseTokens(this.tokens, params, isFirstQueryParam);
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
