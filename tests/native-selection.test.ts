Deno.test("public native compiler selection is supplied by PL owner", async () => {
  const api: Record<string, unknown> = await import(
    "../_extensions/course-prairielearn/public.ts"
  );
  if (typeof api.selectNativeCompilerInputs !== "function") {
    throw Error("PL native compiler selection missing");
  }
});
