import { describe, it } from 'node:test';
import assert from 'node:assert';
import Route from './index.js';

describe('Route', () => {
  it('should create', () => {
    assert.ok(Route('/foo'));
  });

  it('should create with new', () => {
    assert.ok(new Route('/foo'));
  });

  it('should have proper prototype', () => {
    const routeInstance = new Route('/foo');
    assert.ok(routeInstance instanceof Route);
  });

  it('should throw on no spec', () => {
    assert.throws(() => { (Route as any)(); }, /spec is required/);
  });

  describe('basic', () => {
    it('should match /foo with a path of /foo', () => {
      const route = Route('/foo');
      assert.ok(route.match('/foo'));
    });

    it('should match /foo with a path of /foo?query', () => {
      const route = Route('/foo');
      assert.ok(route.match('/foo?query'));
    });

    it("shouldn't match /foo with a path of /bar/foo", () => {
      const route = Route('/foo');
      assert.strictEqual(route.match('/bar/foo'), false);
    });

    it("shouldn't match /foo with a path of /foobar", () => {
      const route = Route('/foo');
      assert.strictEqual(route.match('/foobar'), false);
    });

    it("shouldn't match /foo with a path of /bar", () => {
      const route = Route('/foo');
      assert.strictEqual(route.match('/bar'), false);
    });
  });

  describe('basic parameters', () => {
    it('should match /users/:id with a path of /users/1', () => {
      const route = Route('/users/:id');
      assert.ok(route.match('/users/1'));
    });

    it('should not match /users/:id with a path of /users/', () => {
      const route = Route('/users/:id');
      assert.strictEqual(route.match('/users/'), false);
    });

    it('should match /users/:id with a path of /users/1 and get parameters', () => {
      const route = Route('/users/:id');
      assert.deepStrictEqual(route.match('/users/1'), { id: '1' });
    });

    it('should match deep pathing and get parameters', () => {
      const route = Route('/users/:id/comments/:comment/rating/:rating');
      assert.deepStrictEqual(
        route.match('/users/1/comments/cats/rating/22222'),
        { id: '1', comment: 'cats', rating: '22222' }
      );
    });
  });

  describe('splat parameters', () => {
    it('should handle double splat parameters', () => {
      const route = Route('/*a/foo/*b');
      assert.deepStrictEqual(
        route.match('/zoo/woo/foo/bar/baz'),
        { a: 'zoo/woo', b: 'bar/baz' }
      );
    });
  });

  describe('mixed', () => {
    it('should handle mixed splat and named parameters', () => {
      const route = Route('/books/*section/:title');
      assert.deepStrictEqual(
        route.match('/books/some/section/last-words-a-memoir'),
        { section: 'some/section', title: 'last-words-a-memoir' }
      );
    });
  });

  describe('optional', () => {
    it('should allow and match optional routes without optional part', () => {
      const route = Route('/users/:id(/style/:style)');
      assert.deepStrictEqual(route.match('/users/3'), { id: '3', style: undefined });
    });

    it('should allow and match optional routes with optional part', () => {
      const route = Route('/users/:id(/style/:style)');
      assert.deepStrictEqual(route.match('/users/3/style/pirate'), { id: '3', style: 'pirate' });
    });

    it('allows optional branches that start with a word character', () => {
      const route = Route('/things/(option/:first)');
      assert.deepStrictEqual(route.match('/things/option/bar'), { first: 'bar' });
    });

    describe('nested', () => {
      it('allows nested', () => {
        const route = Route('/users/:id(/style/:style(/more/:param))');
        const result = route.match('/users/3/style/pirate');
        const expected = { id: '3', style: 'pirate', param: undefined };
        assert.deepStrictEqual(result, expected);
      });

      it('fetches the correct params from nested', () => {
        const route = Route('/users/:id(/style/:style(/more/:param))');
        assert.deepStrictEqual(
          route.match('/users/3/style/pirate/more/things'),
          { id: '3', style: 'pirate', param: 'things' }
        );
      });
    });
  });

  describe('tilde prefix', () => {
    it('should match routes starting with ~/', () => {
      const route = Route('~/foo');
      assert.ok(route.match('~/foo'));
    });

    it('should match ~/users/:id with parameters', () => {
      const route = Route('~/users/:id');
      assert.deepStrictEqual(route.match('~/users/123'), { id: '123' });
    });

    it('should reverse routes starting with ~/', () => {
      const route = Route('~/users/:id');
      assert.strictEqual(route.reverse({ id: '456' }), '~/users/456');
    });
  });

  describe('query parameters', () => {
    it('should match a path with query string when route has no query params', () => {
      const route = Route('/foo');
      assert.deepStrictEqual(route.match('/foo?a=1&b=2'), {});
    });

    it('should match a path without query string when route has no query params', () => {
      const route = Route('/foo');
      assert.deepStrictEqual(route.match('/foo'), {});
    });

    it('should match query parameters in same order', () => {
      const route = Route('/?a=:a&b=:b');
      assert.deepStrictEqual(route.match('/?a=1&b=2'), { a: '1', b: '2' });
    });

    it('should match query parameters in different order (issue #17)', () => {
      const route = Route('/?a=:a&b=:b');
      // This test documents the expected behavior - query order should not matter
      assert.deepStrictEqual(route.match('/?b=2&a=1'), { a: '1', b: '2' });
    });

    it('should match path with parameters and query string', () => {
      const route = Route('/users/:id');
      assert.deepStrictEqual(route.match('/users/123?tab=profile'), { id: '123' });
    });

    it('should match path with parameters and multiple query params', () => {
      const route = Route('/users/:id');
      assert.deepStrictEqual(route.match('/users/123?tab=profile&view=grid'), { id: '123' });
    });

    it('should not match when required query param is missing', () => {
      const route = Route('/foo?a=:a');
      assert.strictEqual(route.match('/foo'), false);
    });

    it('should not match when one of multiple required query params is missing', () => {
      const route = Route('/?a=:a&b=:b');
      assert.strictEqual(route.match('/?a=1'), false);
    });

    it('should match when query has a fixed value', () => {
      const route = Route('/foo?type=bar');
      assert.deepStrictEqual(route.match('/foo?type=bar'), {});
    });

    it('should not match when query has a different fixed value', () => {
      const route = Route('/foo?type=bar');
      assert.strictEqual(route.match('/foo?type=baz'), false);
    });

    it('should not match when query with fixed value is missing', () => {
      const route = Route('/foo?type=bar');
      assert.strictEqual(route.match('/foo'), false);
    });
  });

  describe('structural query parameters', () => {
    it('should not match /?auth(*splat) with / (no query)', () => {
      const route = Route('/?auth(*splat)');
      assert.strictEqual(route.match('/'), false);
    });

    it('should match /?auth(*splat) with /?auth/login/callback', () => {
      const route = Route('/?auth(*splat)');
      assert.deepStrictEqual(route.match('/?auth/login/callback'), { splat: '/login/callback' });
    });

    it('should match /?auth(*splat) with /?auth', () => {
      const route = Route('/?auth(*splat)');
      assert.deepStrictEqual(route.match('/?auth'), { splat: undefined });
    });
  });

  describe('optional query parameters', () => {
    it('should match route with optional query part - without query', () => {
      const route = Route('/search(?q=:query)');
      assert.deepStrictEqual(route.match('/search'), { query: undefined });
    });

    it('should match route with optional query part - with query', () => {
      const route = Route('/search(?q=:query)');
      assert.deepStrictEqual(route.match('/search?q=test'), { query: 'test' });
    });

    it('should match route with optional query params - without any query', () => {
      const route = Route('/api/items(?page=:page(&limit=:limit))');
      assert.deepStrictEqual(route.match('/api/items'), { page: undefined, limit: undefined });
    });

    it('should match route with optional query params - with first param only', () => {
      const route = Route('/api/items(?page=:page(&limit=:limit))');
      assert.deepStrictEqual(route.match('/api/items?page=1'), { page: '1', limit: undefined });
    });

    it('should match route with optional query params - with all params', () => {
      const route = Route('/api/items(?page=:page(&limit=:limit))');
      assert.deepStrictEqual(route.match('/api/items?page=1&limit=10'), { page: '1', limit: '10' });
    });

    it('should reverse route with optional query part - without params', () => {
      const route = Route('/search(?q=:query)');
      assert.strictEqual(route.reverse({}), '/search');
    });

    it('should reverse route with optional query part - with params', () => {
      const route = Route('/search(?q=:query)');
      assert.strictEqual(route.reverse({ query: 'test' }), '/search?q=test');
    });

    it('should reverse route with nested optional query params - partial', () => {
      const route = Route('/api/items(?page=:page(&limit=:limit))');
      assert.strictEqual(route.reverse({ page: '1' }), '/api/items?page=1');
    });

    it('should reverse route with nested optional query params - all', () => {
      const route = Route('/api/items(?page=:page(&limit=:limit))');
      assert.strictEqual(route.reverse({ page: '1', limit: '10' }), '/api/items?page=1&limit=10');
    });

    describe('independently optional query parameters', () => {
      // Pattern: /search(?param1=:param1)(&param2=:param2)
      // The ? and & should be intelligently handled during matching

      it('should match with no query params', () => {
        const route = Route('/search(?param1=:param1)(&param2=:param2)');
        assert.deepStrictEqual(route.match('/search'), { param1: undefined, param2: undefined });
      });

      it('should match with first param only', () => {
        const route = Route('/search(?param1=:param1)(&param2=:param2)');
        assert.deepStrictEqual(route.match('/search?param1=foo'), { param1: 'foo', param2: undefined });
      });

      it('should match with second param only', () => {
        const route = Route('/search(?param1=:param1)(&param2=:param2)');
        // When only second param present, ? should be used instead of &
        assert.deepStrictEqual(route.match('/search?param2=bar'), { param1: undefined, param2: 'bar' });
      });

      it('should match with both params', () => {
        const route = Route('/search(?param1=:param1)(&param2=:param2)');
        assert.deepStrictEqual(route.match('/search?param1=foo&param2=bar'), { param1: 'foo', param2: 'bar' });
      });

      it('should match with both params in different order', () => {
        const route = Route('/search(?param1=:param1)(&param2=:param2)');
        assert.deepStrictEqual(route.match('/search?param2=bar&param1=foo'), { param1: 'foo', param2: 'bar' });
      });

      it('should reverse with no params', () => {
        const route = Route('/search(?param1=:param1)(&param2=:param2)');
        assert.strictEqual(route.reverse({}), '/search');
      });

      it('should reverse with first param only', () => {
        const route = Route('/search(?param1=:param1)(&param2=:param2)');
        assert.strictEqual(route.reverse({ param1: 'foo' }), '/search?param1=foo');
      });

      it('should reverse with both params', () => {
        const route = Route('/search(?param1=:param1)(&param2=:param2)');
        assert.strictEqual(route.reverse({ param1: 'foo', param2: 'bar' }), '/search?param1=foo&param2=bar');
      });

      // Route defined with params in reverse order - ? and & should not affect matching
      it('should match when route defines params in reverse order', () => {
        const route = Route('/search(?param2=:param2)(&param1=:param1)');
        // URL has param1 first, route has param2 first - should still match
        assert.deepStrictEqual(route.match('/search?param1=foo&param2=bar'), { param1: 'foo', param2: 'bar' });
      });

      it('should match when route and URL have same reverse order', () => {
        const route = Route('/search(?param2=:param2)(&param1=:param1)');
        assert.deepStrictEqual(route.match('/search?param2=bar&param1=foo'), { param1: 'foo', param2: 'bar' });
      });
    });
  });

  describe('reverse', () => {
    it('reverses routes without params', () => {
      const route = Route('/foo');
      assert.strictEqual(route.reverse(), '/foo');
    });

    it('reverses routes with simple params', () => {
      const route = Route('/:foo/:bar');
      assert.strictEqual(route.reverse({ foo: '1', bar: '2' }), '/1/2');
    });

    it('reverses routes with optional params', () => {
      const route = Route('/things/(option/:first)');
      assert.strictEqual(route.reverse({ first: 'bar' }), '/things/option/bar');
    });

    it('reverses routes with unfilled optional params', () => {
      const route = Route('/things/(option/:first)');
      assert.strictEqual(route.reverse(), '/things/');
    });

    it("reverses routes with optional params that can't fulfill the optional branch", () => {
      const route = Route('/things/(option/:first(/second/:second))');
      assert.strictEqual(route.reverse({ second: 'foo' }), '/things/');
    });

    it("returns false for routes that can't be fulfilled", () => {
      const route = Route('/foo/:bar');
      assert.strictEqual(route.reverse({}), false);
    });

    it("returns false for routes with splat params that can't be fulfilled", () => {
      const route = Route('/foo/*bar');
      assert.strictEqual(route.reverse({}), false);
    });

    it('allows reversing falsy valued params', () => {
      const path = '/account/json/wall/post/:id/comments/?start=:start&max=:max';
      const vars = {
        id: 50,
        start: 0,
        max: 12
      };
      assert.strictEqual(
        Route(path).reverse(vars),
        '/account/json/wall/post/50/comments/?start=0&max=12'
      );
    });
  });
});
