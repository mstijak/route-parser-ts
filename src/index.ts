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
 * Build a regex pattern from path tokens
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
        pattern += '([^/]+)';
        paramNames.push(token.value);
        break;
      case 'splat':
        pattern += '(.+?)';
        paramNames.push(token.value);
        break;
      case 'optional':
        if (token.children) {
          const { pattern: childPattern, paramNames: childNames } = buildPathRegex(token.children);
          pattern += `(?:${childPattern})?`;
          paramNames.push(...childNames);
        }
        break;
      case 'querySeparator':
        break;
    }
  }

  return { pattern, paramNames };
}

/**
 * Build a regex pattern from query tokens.
 * Handles both key-value patterns (a=:a&b=:b) and structural patterns (auth(*splat)).
 * Strips leading ? and & query separators from optional children.
 */
function buildQueryRegex(tokens: Token[]): { pattern: string; paramNames: string[] } {
  let pattern = '';
  const paramNames: string[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'static':
        pattern += escapeRegex(token.value);
        break;
      case 'param':
        pattern += '([^&]+)';
        paramNames.push(token.value);
        break;
      case 'splat':
        pattern += '(.+?)';
        paramNames.push(token.value);
        break;
      case 'optional':
        if (token.children) {
          // Strip leading query separators (? and &) from optional children
          let children = token.children;
          while (children.length > 0 && children[0].type === 'querySeparator') {
            children = children.slice(1);
          }
          const { pattern: childPattern, paramNames: childNames } = buildQueryRegex(children);
          pattern += `(?:${childPattern})?`;
          paramNames.push(...childNames);
        }
        break;
      case 'querySeparator':
        if (token.value === '&') {
          pattern += '&';
        }
        break;
    }
  }

  return { pattern, paramNames };
}

/**
 * Extract query definitions as { key, paramName?, fixedValue?, optional } for map-based matching.
 */
interface QueryDef {
  key: string;
  paramName?: string;
  fixedValue?: string;
  optional: boolean;
}

function extractQueryDefs(tokens: Token[], optional: boolean = false): QueryDef[] {
  const defs: QueryDef[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'param') {
      let key = token.value;
      if (i > 0) {
        const prevToken = tokens[i - 1];
        if (prevToken.type === 'static' && prevToken.value.endsWith('=')) {
          const match = prevToken.value.match(/([^=&?]+)=$/);
          if (match) key = match[1];
        }
      }
      defs.push({ key, paramName: token.value, optional });
    } else if (token.type === 'static') {
      // Extract fixed key=value pairs (e.g., 'type=bar')
      for (const part of token.value.split('&')) {
        const clean = part.replace(/^[?&]/, '');
        const eqIdx = clean.indexOf('=');
        if (eqIdx > 0 && clean.length > eqIdx + 1) {
          defs.push({ key: clean.slice(0, eqIdx), fixedValue: clean.slice(eqIdx + 1), optional });
        }
      }
    } else if (token.type === 'optional' && token.children) {
      defs.push(...extractQueryDefs(token.children, true));
    }
  }

  return defs;
}

/**
 * Check if tokens contain splat parameters (recursively)
 */
function hasSplats(tokens: Token[]): boolean {
  for (const token of tokens) {
    if (token.type === 'splat') return true;
    if (token.type === 'optional' && token.children && hasSplats(token.children)) return true;
  }
  return false;
}

/**
 * Parse a query string into key-value pairs
 */
function parseQueryString(queryString: string): Map<string, string> {
  const params = new Map<string, string>();
  if (!queryString) return params;

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
 * RouteParser class
 */
class RouteParser {
  public spec: string;
  private tokens: Token[];
  private pathRegex: RegExp;
  private pathParamNames: string[];
  // Query matching: use regex for structural patterns (splats), map-based for key-value patterns
  private queryRegex: RegExp | null;
  private queryRegexParamNames: string[];
  private queryDefs: QueryDef[];

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

    // Query matching setup
    if (queryTokens.length > 0 && hasSplats(queryTokens)) {
      // Structural query: use regex
      const qTokens = queryTokens[0]?.type === 'querySeparator' ? queryTokens.slice(1) : queryTokens;
      const { pattern: qPattern, paramNames: qParamNames } = buildQueryRegex(qTokens);
      this.queryRegex = new RegExp(`^${qPattern}$`);
      this.queryRegexParamNames = qParamNames;
      this.queryDefs = [];
    } else {
      // Key-value query: use map-based matching (order-independent)
      this.queryRegex = null;
      this.queryRegexParamNames = [];
      this.queryDefs = extractQueryDefs(queryTokens);
    }
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

    const match = this.pathRegex.exec(pathname);
    if (!match) {
      return false;
    }

    const params: RouteParams = {};

    // Extract path parameters
    for (let i = 0; i < this.pathParamNames.length; i++) {
      params[this.pathParamNames[i]] = match[i + 1];
    }

    // Structural query matching (splats)
    if (this.queryRegex) {
      const qMatch = this.queryRegex.exec(queryString);
      if (!qMatch) return false;
      for (let i = 0; i < this.queryRegexParamNames.length; i++) {
        params[this.queryRegexParamNames[i]] = qMatch[i + 1];
      }
    }

    // Key-value query matching (order-independent)
    if (this.queryDefs.length > 0) {
      const urlQueryParams = parseQueryString(queryString);
      for (const def of this.queryDefs) {
        if (def.fixedValue !== undefined) {
          if (urlQueryParams.get(def.key) !== def.fixedValue && !def.optional) return false;
        } else {
          const value = urlQueryParams.get(def.key);
          if (value !== undefined) {
            params[def.paramName!] = value;
          } else if (def.optional) {
            params[def.paramName!] = undefined;
          } else {
            return false;
          }
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
