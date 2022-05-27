import { describe, expect, it } from "vitest";
import {
  HKT,
  op,
  Operation,
  ret,
  Return,
  run,
  seq,
  withHandler,
} from "../src/index";
import { Effect } from "../effects";

/**
 * this set of tests implements (almost) all the examples in Section 2 of
 * the paper _An Introduction to Algebraic Effects and Handlers. Invited tutorial paper_
 * paper url: https://www.eff-lang.org/handlers-tutorial.pdf
 */

describe("test set 0", () => {
  it("1. return", () => {
    const data = Math.random();
    const v: number = run(ret(data));
    expect(v).toBe(data);
  });

  it("2. seq", () => {
    const data = Math.random();
    const v: number = run(seq(ret(data), (x) => ret(x * 2)));
    expect(v).toBe(data * 2);
  });

  it("3. id handler", () => {
    // id effect does nothing but return the payload
    class Id<T, K> {
      id<W>(s: W, k: (w: W) => K) {
        return k(s);
      }
    }
    interface IdHKT extends HKT {
      readonly type: Id<this["computationReturn"], this["continuation"]>;
    }
    const data = Math.random();
    const v: number = run(
      withHandler<IdHKT>(new Id()).handle(op<"id", typeof data>("id", data))
    );
    expect(v).toBe(data);
  });

  describe("io", () => {
    class AlwaysRead<T, K> {
      constructor(public readonly text: string) {}

      read(_: any, k: (s: string) => K) {
        return k(this.text);
      }
    }

    interface AlwaysReadHKT extends HKT {
      readonly type: AlwaysRead<
        this["computationReturn"],
        this["continuation"]
      >;
    }

    class Collect<T, K> {
      return(s: T) {
        return ret([s, ""] as const);
      }

      print(s: string, k: () => K) {
        return seq(k(), (_) => {
          const [x, acc] = _ as [T, string];
          return ret([x, join(s, acc)] as const);
        });
      }
    }

    interface CollectHKT extends HKT {
      readonly type: Collect<this["computationReturn"], this["continuation"]>;
    }

    class ReversePrint<T, K> {
      print(s: string, k: () => K) {
        return seq(k(), (_) => seq(print(s), (__) => ret(_)));
      }
    }

    interface ReversePrintHKT extends HKT {
      readonly type: ReversePrint<
        this["computationReturn"],
        this["continuation"]
      >;
    }
    it("4. constant input", () => {
      const printFullname = seq(print("What's your forename?"), (_) =>
        seq(read(), (forename) =>
          seq(print("What's your surname?"), (_) =>
            seq(read(), (surname) => print(`${forename} ${surname}`))
          )
        )
      );
      globalPrintBuffer.length = 0;
      run(
        withHandler<MemPrintHKT>(new MemPrint()).handle(
          withHandler<AlwaysReadHKT>(new AlwaysRead("Bob")).handle(
            printFullname
          )
        )
      );
      expect(globalPrintBuffer).toEqual([
        "What's your forename?",
        "What's your surname?",
        "Bob Bob",
      ]);
    });

    const abc = seq(print("A"), (_) => seq(print("B"), (_) => print("C")));

    it("5. collecting output", () => {
      const [_, text] = run(withHandler<CollectHKT>(new Collect()).handle(abc));
      expect(text).toBe("A B C");
    });

    it("6. collecting reversed output", () => {
      const [_, text] = run(
        withHandler<CollectHKT>(new Collect()).handle(
          withHandler<ReversePrintHKT>(new ReversePrint()).handle(abc)
        )
      );
      expect(text).toBe("C B A");
    });
  });

  it("7. exception", () => {
    let safeDiv = (a: number, b: number) =>
      b === 0 ? raise("Can not divede by zero") : ret(a / b);
    expect(
      run(withHandler<DefaultHKT>(new Default(42)).handle(safeDiv(1, 0)))
    ).toBe(42);
    expect(
      run(withHandler<DefaultHKT>(new Default(42)).handle(safeDiv(15, 3)))
    ).toBe(5);
  });

  describe("non-determinism", () => {
    let choose = <X, Y>(x: X, y: Y) =>
      seq(decide(), (b) => (b ? ret(x) : ret(y)));

    class PickTrue<T, K> {
      decide(_: any, k: (decision: boolean) => K) {
        return k(true);
      }
    }

    interface PickTrueHKT extends HKT {
      readonly type: PickTrue<this["computationReturn"], this["continuation"]>;
    }

    class PickMax<T, K> {
      decide(_: any, k: (decision: boolean) => K) {
        return seq(k(true), (xt) =>
          seq(k(false), (xf) =>
            /* expect continuation returns a number */ ret(
              Math.max(xt as number, xf as number) as number
            )
          )
        );
      }
    }

    interface PickMaxHKT extends HKT {
      readonly type: PickMax<this["computationReturn"], this["continuation"]>;
    }

    class PickAll<T, K> {
      return(s: T) {
        return ret([s]);
      }

      decide(_: any, k: (decision: boolean) => K) {
        return seq(k(true), (xt) =>
          seq(k(false), (xf) => ret([...(xt as T[]), ...(xf as T[])]))
        );
      }
    }

    interface PickAllHKT extends HKT {
      readonly type: PickAll<this["computationReturn"], this["continuation"]>;
    }

    it("8. non-determinism", () => {
      let chooseDiff = seq(choose(15, 30), (x1) =>
        seq(choose(5, 10), (x2) => ret(x1 - x2))
      );
      expect(
        run(withHandler<PickTrueHKT>(new PickTrue()).handle(chooseDiff))
      ).toBe(10);
      expect(
        run(withHandler<PickMaxHKT>(new PickMax()).handle(chooseDiff))
      ).toBe(25);
      expect(
        run(withHandler<PickAllHKT>(new PickAll()).handle(chooseDiff))
      ).toEqual([10, 5, 25, 20]);
    });
    it("9. backtrack", () => {
      class FailContinuation<T, K, KK> {
        constructor(public readonly kk: (decision: boolean) => KK) {}

        fail(_: any, __: any) {
          return this.kk(false);
        }
      }

      interface FailContinuationHKT<K> extends HKT {
        readonly type: FailContinuation<
          this["computationReturn"],
          this["continuation"],
          K
        >;
      }

      class Backtrack<T, K> {
        decide(_: any, k: (decision: boolean) => K) {
          return withHandler<FailContinuationHKT<K>>(
            new FailContinuation(k)
          ).handle(k(true));
        }
      }

      interface BacktrackHKT extends HKT {
        readonly type: Backtrack<
          this["computationReturn"],
          this["continuation"]
        >;
      }

      let isSquare = (x: number) => Math.sqrt(x) === (Math.sqrt(x) | 0);

      /** typescript doesn't fully support recursive type definition
       * it also lacks support of recursive function type inference
       */

      // type GFail =
      //   | Operation<"fail", undefined, never, Return<never>>
      //   | Operation<"decide", undefined, boolean, Return<number> | GFail>;
      type G =
        | Operation<"fail", Return<never>>
        | Operation<"decide", Return<number> | never>;

      let chooseInt: (m: number, n: number) => G = (m: number, n: number) =>
        m > n
          ? fail()
          : seq(decide(), (b) => (b ? ret(m) : (chooseInt(m + 1, n) as never)));

      let pythagorean = (m: number, n: number) =>
        seq(chooseInt(m, n - 1), (a) =>
          seq(chooseInt(a + 1, n), (b) =>
            isSquare(a * a + b * b)
              ? ret([a, b, Math.sqrt(a * a + b * b)])
              : fail()
          )
        );

      const g: number[] = run(
        withHandler<BacktrackHKT>(new Backtrack()).handle(pythagorean(4, 15))
      );
      expect(g).toEqual([5, 12, 13]);

      expect(() => {
        run(
          withHandler<BacktrackHKT>(new Backtrack()).handle(pythagorean(7, 10))
        );
      }).toThrow("computation failed!");
    });
  });

  describe("state", () => {
    // it's a number state..
    type StateType = number;
    class State<T, K> {
      return(x: T) {
        return ret((_: StateType) => ret(x));
      }

      get(_: any, k: (v: StateType) => K) {
        return ret((_s: StateType) =>
          seq(k(_s), (_f) => (_f as (v: StateType) => Return<T>)(_s))
        );
      }

      set(s: StateType, k: (v: void) => K) {
        return ret((_: StateType) =>
          seq(k(), (_f) => (_f as (v: StateType) => Return<T>)(s))
        );
      }
    }

    interface StateHKT extends HKT {
      readonly type: State<this["computationReturn"], this["continuation"]>;
    }

    const get = () => op<"get", StateType>("get", undefined);
    const set = (v: StateType) => op<"set", StateType>("set", v);
    it("10. state", () => {
      const g = withHandler<StateHKT>(new State()).handle(
        seq(get(), (v) => seq(set(v * 2), (_) => get()))
      );
      const w = run(g);
      const f = run(w(10));
      expect(f).toBe(20);
    });

    it("11. transaction", () => {
      class Transaction<T, K> {
        return(x: T) {
          return ret((s: StateType) => seq(set(s), (_) => ret(x)));
        }

        get(_: any, k: (v: StateType) => K) {
          return ret((_s: StateType) =>
            seq(k(_s), (_f) => (_f as (v: StateType) => Return<T>)(_s))
          );
        }

        set(s: StateType, k: (v: void) => K) {
          return ret((_: StateType) =>
            seq(k(), (_f) => (_f as (v: StateType) => Return<T>)(s))
          );
        }
      }

      interface TransactionHKT extends HKT {
        readonly type: Transaction<
          this["computationReturn"],
          this["continuation"]
        >;
      }

      let program = (success: boolean) =>
        seq(get(), (value) => (success ? set(value * 2) : raise("set failed")));
      /* program(success) {
        let value = getState();
        if(success) {
          setState(value * 2);
        } else {
          fail();
        }
      } */
      const transactioned = (success: boolean, init: StateType) =>
        withHandler<DefaultHKT>(new Default(0)).handle(
          seq(
            withHandler<TransactionHKT>(new Transaction()).handle(
              program(success)
            ),
            (f) => f(init)
          )
        );
      /* transactioned(success, init) {
          with default(0) handle 
            (with transaction handle program(success)) (init)
        }
        */
      const main = (success: boolean, init: StateType) =>
        seq(
          withHandler<StateHKT>(new State()).handle(
            seq(get(), (v) => seq(transactioned(success, v), (_) => get()))
          ),
          (f) => f(init)
        );
      /* main(success, init) {
          (with state handle {
            let value = getState();
            transactioned(success, value);
            return getState();
          }) (init) // 
        }
         */
      expect(run(main(true, 10))).toBe(20);
      expect(run(main(false, 10))).toBe(10);
    });
  });
});

/**
 * Shared features
 */

declare module "../src/effects" {
  interface Effects<T> {
    print: Effect<string, void>;
    id: Effect<T, T>;
    read: Effect<undefined, string>;
    raise: Effect<string, never>;
    get: Effect<undefined, T>;
    set: Effect<T, void>;
    decide: Effect<undefined, boolean>;
  }
}

const globalPrintBuffer: string[] = [];

class MemPrint<T, K> {
  print(s: string, k: () => K) {
    return seq(
      op<"io", void>("io", () => globalPrintBuffer.push(s)),
      (_) => k()
    );
  }
}

interface MemPrintHKT extends HKT {
  readonly type: MemPrint<this["computationReturn"], this["continuation"]>;
}

class Default<T, K> {
  constructor(public readonly value: T) {}

  raise(_: any, __: any) {
    return ret(this.value);
  }
}

interface DefaultHKT extends HKT {
  readonly type: Default<this["computationReturn"], this["continuation"]>;
}

const print = (s: string) => op("print", s);
const read = () => op("read", undefined);
const raise = (r: string) => op("raise", r);
const fail = () => op("fail", undefined);
const decide = () => op("decide", undefined);
const join = (s: string, s1: string) =>
  s === "" ? s1 : s1 === "" ? s : s + " " + s1;
