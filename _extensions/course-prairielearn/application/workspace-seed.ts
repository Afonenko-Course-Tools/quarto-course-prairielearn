type Artifact = {
  files: { name: string; bytes: Uint8Array }[];
  archive: Uint8Array;
};

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
  const manifest = { schema: "pl-git-workspace-seed-v1", files: names };
  return [
    { name: ".pl-seed/starter.zip", data: artifact.archive },
    {
      name: ".pl-seed/manifest.json",
      data: new TextEncoder().encode(JSON.stringify(manifest, null, 2) + "\n"),
    },
  ];
}
