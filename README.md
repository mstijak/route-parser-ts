# route-parser-ts

A TypeScript URL routing library that parses route patterns and matches them against URL paths. Supports named parameters, splat (wildcard) parameters, and optional segments.

Based on [route-parser](https://github.com/rcs/route-parser) by Ryan Sorensen.

## Installation

```bash
npm install route-parser-ts
```

## Usage

```typescript
import Route from 'route-parser-ts';

// Create a route
const route = Route('/users/:id');

// Match a path
const result = route.match('/users/123');
// => { id: '123' }

// Reverse a route
const path = route.reverse({ id: '456' });
// => '/users/456'
```

## Route Patterns

### Static Paths

Match exact paths:

```typescript
const route = Route('/foo');

route.match('/foo');      // => {}
route.match('/foo?query'); // => {} (query strings are ignored)
route.match('/bar');      // => false
route.match('/foobar');   // => false
```

### Named Parameters

Capture path segments with `:param` syntax:

```typescript
const route = Route('/users/:id');

route.match('/users/123');  // => { id: '123' }
route.match('/users/abc');  // => { id: 'abc' }
route.match('/users/');     // => false
```

Multiple parameters:

```typescript
const route = Route('/users/:userId/posts/:postId');

route.match('/users/1/posts/42');
// => { userId: '1', postId: '42' }
```

### Splat Parameters

Capture multiple path segments with `*param` syntax:

```typescript
const route = Route('/files/*path');

route.match('/files/images/photo.jpg');
// => { path: 'images/photo.jpg' }
```

Multiple splats:

```typescript
const route = Route('/*a/foo/*b');

route.match('/zoo/woo/foo/bar/baz');
// => { a: 'zoo/woo', b: 'bar/baz' }
```

### Mixed Parameters

Combine splats and named parameters:

```typescript
const route = Route('/books/*section/:title');

route.match('/books/some/section/last-words-a-memoir');
// => { section: 'some/section', title: 'last-words-a-memoir' }
```

### Optional Segments

Make parts of the route optional with parentheses:

```typescript
const route = Route('/users/:id(/style/:style)');

route.match('/users/3');
// => { id: '3', style: undefined }

route.match('/users/3/style/pirate');
// => { id: '3', style: 'pirate' }
```

Optional segments starting with a word:

```typescript
const route = Route('/things/(option/:first)');

route.match('/things/option/bar');
// => { first: 'bar' }
```

Nested optional segments:

```typescript
const route = Route('/users/:id(/style/:style(/more/:param))');

route.match('/users/3');
// => { id: '3', style: undefined, param: undefined }

route.match('/users/3/style/pirate');
// => { id: '3', style: 'pirate', param: undefined }

route.match('/users/3/style/pirate/more/things');
// => { id: '3', style: 'pirate', param: 'things' }
```

## API

### `Route(spec: string)`

Creates a new route parser. Can be called with or without `new`.

```typescript
const route1 = Route('/users/:id');
const route2 = new Route('/users/:id');
```

Throws an error if `spec` is not provided.

### `route.match(path: string): object | false`

Matches a path against the route pattern. Returns an object with the captured parameters on success, or `false` if the path doesn't match.

```typescript
const route = Route('/users/:id');

route.match('/users/123');  // => { id: '123' }
route.match('/posts/123');  // => false
```

### `route.reverse(params?: object): string | false`

Generates a path from the route pattern and provided parameters. Returns the path string on success, or `false` if required parameters are missing.

```typescript
const route = Route('/users/:id/posts/:postId');

route.reverse({ id: '1', postId: '42' });
// => '/users/1/posts/42'

route.reverse({ id: '1' });
// => false (missing required parameter)
```

With optional segments:

```typescript
const route = Route('/things/(option/:first)');

route.reverse({ first: 'bar' });
// => '/things/option/bar'

route.reverse();
// => '/things/' (optional segment omitted)
```

Falsy values (like `0`) are handled correctly:

```typescript
const route = Route('/items/:id?page=:page');

route.reverse({ id: 1, page: 0 });
// => '/items/1?page=0'
```

## TypeScript

The library is written in TypeScript and includes type definitions.

```typescript
import Route, { RouteParams } from 'route-parser-ts';

const route = Route('/users/:id');
const params: RouteParams | false = route.match('/users/123');

if (params) {
  console.log(params.id); // '123'
}
```

## Acknowledgments

This library is a TypeScript reimplementation of [route-parser](https://github.com/rcs/route-parser) by [Ryan Sorensen](https://github.com/rcs). The original library provides the same functionality in JavaScript.

## License

MIT
