/** Внутреннее окружение C children. Не authority и не свидетельство prior P.
 * Единственный снимок берётся внутри проверенной composition; ambient map затем
 * читается только для сравнения, никогда для построения следующего child env. */
export type NativeAuxiliary = Readonly<{
  environment: Readonly<Record<string, string>>;
  before: (
    overlays?: Readonly<Record<string, string>>,
  ) => Promise<Record<string, string>>;
  after: () => Promise<void>;
}>;
export function captureNativeAuxiliary(
  assertCurrent: () => Promise<void>,
): NativeAuxiliary {
  const environment = Object.freeze({ ...Deno.env.toObject() });
  const check = async () => {
    await assertCurrent();
    const actual = Deno.env.toObject();
    if (
      Object.keys(actual).length !== Object.keys(environment).length ||
      Object.entries(environment).some(([key, value]) => actual[key] !== value)
    ) {
      throw Error(
        "PL.NATIVE_ENV_CHANGED: auxiliary launch environment changed",
      );
    }
  };
  return Object.freeze({
    environment,
    before: async (overlays: Readonly<Record<string, string>> = {}) => {
      await check();
      return { ...environment, ...overlays };
    },
    after: check,
  });
}
