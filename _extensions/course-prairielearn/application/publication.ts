/** Directory publication needs an actual no-replace primitive, not lstat + rename.
 * GNU mv checks the native rename capability and --no-copy forbids an EXDEV copy. */
export async function publishDirectory(
  source: string,
  destination: string,
  environment?: Readonly<Record<string, string>>,
): Promise<void> {
  const options = environment
    ? { clearEnv: true, env: { ...environment } }
    : {};
  const command = async (args: string[]) =>
    await new Deno.Command("mv", {
      args,
      ...options,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    }).output();
  let help: Deno.CommandOutput;
  try {
    help = await command(["--help"]);
  } catch (cause) {
    throw Error(
      "PL publication requires GNU mv with --no-copy --update=none-fail -T",
      { cause },
    );
  }
  const text = new TextDecoder().decode(help.stdout);
  if (
    !help.success ||
    !["--no-copy", "none-fail", "--no-target-directory"].every((flag) =>
      text.includes(flag),
    )
  ) {
    throw Error(
      "PL publication requires GNU mv with --no-copy --update=none-fail -T",
    );
  }
  const result = await command([
    "--no-copy",
    "--update=none-fail",
    "-T",
    "--",
    source,
    destination,
  ]);
  if (!result.success) {
    throw Error(
      "PL cannot publish fresh output: " +
        new TextDecoder().decode(result.stderr).trim(),
    );
  }
}
