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
