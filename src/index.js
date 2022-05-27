function ret(s) {
  return {
    type: "ret",
    value: s,
  };
}

function op(effect, payload, cont) {
  return {
    type: "op",
    effect,
    payload,
    cont,
  };
}

function seq(current, then) {
  if (current.type === "ret") {
    return then(current.value);
  }
  if (current.type === "op") {
    return op(current.effect, current.payload, (x) =>
      seq(current.cont(x), then)
    );
  }
  throw new Error(`unknown computation: ${current.type}`);
}

function withHandler(handler) {
  return {
    handle(handling) {
      if (handling.type === "ret") {
        return handler.return ? handler.return(handling.value) : handling;
      }
      if (handling.type === "op") {
        if (handling.effect in handler) {
          return handler[handling.effect](handling.payload, (y) =>
            withHandler(handler).handle(handling.cont(y))
          );
        } else {
          return op(handling.effect, handling.payload, (y) =>
            withHandler(handler).handle(handling.cont(y))
          );
        }
      }
      throw new Error(`unknown computation: ${current.type}`);
    },
  };
}

function step_iter(cc) {
  while (true) {
    if (cc.type === "ret") {
      return cc.value;
    } else if (cc.type === "op") {
      if (cc.effect === "io") {
        cc = cc.cont(cc.payload());
      } else if (cc.effect === "fail") {
        throw new Error("computation failed!");
      } else {
        throw new Error(`unhanded effect: ${cc.effect}`);
      }
    } else {
      throw new Error(`unknown computation: ${current.type}`);
    }
  }
}

function genericEffect(effect, payload) {
  return op(effect, payload, ret);
}

export { seq, withHandler, genericEffect as op, ret, step_iter as run };
