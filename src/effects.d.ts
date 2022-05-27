interface Effects<T> {
  io: Effect<() => T, T>;
  fail: Effect<undefined, never>;
}

type EffectTypes = keyof Effects<any>;

type Effect<Payload, Resume> = {
  payload: Payload;
  resume: Resume;
};

export type { EffectTypes, Effects, Effect };
