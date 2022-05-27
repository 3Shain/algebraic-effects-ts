# algebraic-effects-ts

This project implements _Algebraic Effects and Handlers_ described in [this paper](https://www.eff-lang.org/handlers-tutorial.pdf) in TypeScript with (almost) fully type system support.

## Highlights

- **Fully typed**: Leverage TypeScript's type system to trace your computational effects.
- **Multi-shot**: Not implemented by generator but continuations such that an effect can continue multiple times with different payloads.
- **Simple**: Not a surprise
  - Bonus: compare the .js file and .d.ts declaration. You'll realize they are in fact isomorphic.


However this project is __not ready for production__, as there is a limitation of typescript recursive type inference (not safe to be abused), as well as the dev experience with continuation(callbacks) is subjectively poor :/

## How it works

The js implementation is almost a translation of operational semantics from the paper mentioned above and the type declaration is naturally an isomorphism to the js one.

> To get a sense of the following contents, I'm assuming that you know about algebraic effects already (at least you have read some related papers).

There are 6 types of computation and 2 of those are primitive: Others can be transformed to primitives or already provided by javascript.

- return(value) : A computation returns a value
- op(effect, payload, continuation) : A computation performs effect with payload, then evaluate continuation with the result of effect.
- sequence(computation, continuation): Run computation then evaluate continuation with the result of computation. Can be transformed to either Return of Op
- with(handler).handle(computation): Handle the operation yielded by computation if capable or yield forward. Can be transformed to either Return or Op
- if value then computation1 else computation2: Map to ternary operator `value ? computation1 : computation2`
- fn(value): Map to normal function calls

And computation from the perspective of regular javascript semantic is in fact a plain object of either `{type: 'ret', value}` or `{type: 'op', effect, payload, continuation }`. (can be created by calling `ret(value)` or `op(effect,payload)`)

> Why not `op(effect,payload, continuation)` ? Well it should be but for convenience a wrapped function is provided (_generic effects_, see the paper for extra explaining)

## Example

```ts
import { run, op, ret, seq } from "algebraic-effects-ts";

const print = (str: string) => op("io", () => console.log(str));

run(seq(ret("Hello, "), (a) => seq(ret("world!"), (b) => print(a + b))));

// expect console output: Hello, world!
```

Check out the tests inside `/tests` folder.

## Effects

Simply literal string is used to represent effect types because it's enough and typescript has no first-class support of nominal typing (could be done via literal string or unique symbol but the latter is not human distinguishable)

The payload and return type of effects are tightly coupled with effect declaration and you should declare like this

```ts
declare module 'algebraic-effects-ts' {
  interface Effects<T> {
    // what is the T for? in case you want HKT. but you may not need it.
    // you can always pass it by the second generic type parameter of `op` 
    effectName: Effect<PayloadType, ResumeType>;
    ...
  }
}
```

and `op("effectName", ...)` will give you correct payload (the second parameter) and resume type (the computation result type) inference.

### Built-in effects

#### `op("io" , ()=> <...>)`

Run a side effect. Then resume with the return value.

#### `op("fail", undefined)`

Just terminate and throw an js error.

## Handlers

To define a handler, first you need to define a class with two generic type parameter

```ts
class MyHandler<T,K> {
  // T is for return type of handled computation
  // K is for continuation (which is a computation!)

  // this is optional, if you don't modify the return value
  // NB: you should always return a "computation" in js functions instead of arbitrary js value.
  return(value: T) {
    return ret(value); 
  }

  // assume myEffect is already declared and 
  // `MyEffectPayloadType` as well as `MyEffectResumeType` are defined somewhere
  myEffect(payload: MyEffectPayloadType, k: (r:MyEffectResumeType) => K) {
    // ... effect implementation
    return k(doSomethingWith(payload));
    // technically speaking this example is identical to just call a function... not a very good demonstration
  }
}
```

then define a HKT
```ts
import type { HKT } from 'algebraic-effects-ts';

interface MyHandlerHKT extends HKT {
   readonly type: MyHandler<
        this["computationReturn"],
        this["continuation"]
      >;
}
```

this is how you apply your handler

```ts
withHandler<MyHandlerHKT>(new MyHandler()).handle(/* computation to be handled */);
// and it returns another computation
```

### Side notes

If you are familiar with `fp-ts` then you may recognize that there are two kinds of HKT Encoding methods be used (one for effect and another for handler). I was trying to unify them but I failed. I think current result is acceptable. The first encoding (fp-ts style) is global, while it's not flexible but it's also reasonable to make effects global unique. The second (idea from [this post](https://dev.to/matechs/encoding-of-hkts-in-typescript-5c3)) for handler one is more verbose but flexible so that define a local handler. And it makes generic parameter passing easier (you can check the backtrack example inside tests: we have nested handler and the inside one needs an extra generic type parameter from the outside one). The verbosity is not a big concern as we can always hide them from encapsulation.

## Type

A fun fact is that all performed effects are encoded inside the type of computation, as well as the computation result type. For example: `Operation<"print", Operation<"print", Operation<"print", Return<void>>>>` indicates a computation performs `print` 3 times and return no value. If there are branches, you will get type union.

There is a util type `ComputationResult<TComputation>` that gives you the final result of computation. And `ToHandleEffects<TComputation>` provide all the possible effects as a literal string union. The entry point function `run` utilize these type :
```ts
declare function run<T extends Computation>(
  cc: T
): ToHandleEffects<T> extends "io" | "fail" ? ComputationResult<T> : never;
```
to guarantee that all effects except for built-ins are properly handled, otherwise you will get `never` in compile-time and it reflects an error will be thrown in runtime.

Note typescript doesn't support recursive function inference, this is very inconvenient because you need to declare the computation type manually but it's always intended to be inferred implicitly. 

## References

[the paper](https://www.eff-lang.org/handlers-tutorial.pdf)

[idea of HKT Encoding](https://dev.to/matechs/encoding-of-hkts-in-typescript-5c3)

## Road map

- [ ] async, concurrency
- [ ] (PoC) a language for algebraic effects that use typescript as kernel language (simple ast transformation?), or a language extension?

## Author

3Shain
