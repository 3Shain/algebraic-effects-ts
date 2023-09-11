import type { EffectTypes, Effects } from "./effects";

/** replaced with typescript's implementation, constraints on T removed */
type ReturnType<T> = T extends (...args: any) => infer R ? R : never;

type Computation =
  | Return<unknown>
  | Operation<
      EffectTypes,
      unknown /* any should be Computation but will create a circular reference */
    >;

type ComputationResult<T> = T extends Return<infer C>
  ? C
  : T extends Operation<any, infer C>
  ? ComputationResult<C>
  : never;

type Return<R> = {
  type: "ret";
  value: R;
};

type Operation<E extends EffectTypes, C> = {
  type: "op";
  effect: E;
  payload: Effects<any>[E]["payload"];
  cont: Effects<any>[E]["resume"] extends never
    ? never
    : (resumed: Effects<any>[E]["resume"]) => C;
};

declare function ret<T>(s: T): Return<T>;

// not used

// declare function op<
//   E extends string,
//   P,
//   R /** E,P,R are actually coupled, they should be treat as a whole (type?) */,
//   C extends Computation
// >(effect: E, payload: P, cont: (p: R) => C): Operation<E, P, R, C>;

/**
 * lucky hand-writing type program :/
 * it's isomorphic to what's really happening (in js)!
 */
type Sequence<Current, Then> = Current extends Return<any>
  ? ReturnType<Then>
  : Current extends Operation<infer E, infer C>
  ? Operation<E, Sequence<C, Then>>
  : never;

declare function seq<
  Current /* problem: why not constraint this to Computation?
  Because the current hkt solution doesn't support.
  It's all or nothing */,
  Then extends (pp: ComputationResult<Current> /** to infer */) => any
>(current: Current, then: Then): Sequence<Current, Then>;

type WithHandle<
  HKT extends {
    readonly type: {};
  },
  Handling
> = Handling extends Return<infer T>
  ? "return" extends keyof HKT["type"]
    ? ReturnType<Kind<HKT, T, unknown>["return"]>
    : Handling
  : Handling extends Operation<infer E, infer C>
  ? E extends keyof HKT["type"]
    ? ReturnType<Kind<HKT, ComputationResult<C>, WithHandle<HKT, C>>[E]>
    : Operation<E, WithHandle<HKT, C>>
  : never;

declare function withHandler<
  HKT extends {
    readonly type: object;
  }
>(
  handler: HKT["type"]
): {
  handle<Handling>(handling: Handling): WithHandle<HKT, Handling>;
};

type Kind<F, ReturnType, ResumeType> = F extends {
  readonly type: unknown;
}
  ? (F & {
      readonly computationReturn: ReturnType;
      readonly continuation: ResumeType;
    })["type"]
  : never;

type ToHandleEffects<T> = T extends Operation<infer E, infer D>
  ? E | ToHandleEffects<D>
  : never;

declare function step_iter<T extends Computation>(
  cc: T
): ToHandleEffects<T> extends "io" | "fail"
  ? ComputationResult<T>
  : `unhanded effect: ${Exclude<ToHandleEffects<T>, "io" | "fail">}`;

interface HKT {
  readonly computationReturn: unknown;
  readonly continuation: Computation;
}

declare function genericEffect<E extends EffectTypes, T>(
  effect: E,
  payload: Effects<T>[E]["payload"]
): Operation<E, Return<Effects<T>[E]["resume"]>>;

export { seq, withHandler, genericEffect as op, ret, step_iter as run };
export type {
  HKT,
  ToHandleEffects,
  Computation,
  Return,
  Operation,
  ComputationResult,
};
