type Artifact = {
  files: { name: string; bytes: Uint8Array }[];
  archive: Uint8Array;
};
const sha256 = async (bytes: Uint8Array) =>
  Array.from(
    new Uint8Array(
      await crypto.subtle.digest("SHA-256", new Uint8Array(bytes)),
    ),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");

export async function workspaceSeed(
  artifact: Artifact | undefined,
) {
  if (!artifact || !artifact.archive.length || !artifact.files.length) {
    throw Error(
      "PL.WORKSPACE_SEED: требуется полный Core/Download student artifact",
    );
  }
  const names = artifact.files.map((file) => file.name);
  if (
    new Set(names).size !== names.length ||
    names.some((name) => name.startsWith(".pl-seed/"))
  ) throw Error("PL.WORKSPACE_SEED: повтор либо служебный путь");
  for (
    const required of [
      "work/.git/HEAD",
      "work/.git/index",
      "work/.git/config",
      "work/README.md",
    ]
  ) {
    if (!names.includes(required)) {
      throw Error("PL.WORKSPACE_SEED: отсутствует " + required);
    }
  }
  if (!names.some((name) => name.startsWith("work/.git/objects/"))) {
    throw Error("PL.WORKSPACE_SEED: нет Git objects");
  }
  const entries = await Promise.all(
    artifact.files.map(async (file) => ({
      name: file.name,
      sha256: await sha256(file.bytes),
    })),
  );
  const manifest = {
    schema: "pl-git-workspace-seed-v1",
    sha256: await sha256(artifact.archive),
    files: entries,
  };
  return [
    { name: ".pl-seed/starter.zip", data: artifact.archive },
    {
      name: ".pl-seed/manifest.json",
      data: new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n"),
    },
  ];
}
