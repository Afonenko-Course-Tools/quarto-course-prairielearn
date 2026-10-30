import { captureNativeBusiness } from "../application/native-adapter.ts";
const [root, source, format] = Deno.args[0] === "--"
  ? Deno.args.slice(1)
  : Deno.args;
const text = await new Response(Deno.stdin.readable).text();
await captureNativeBusiness(
  root,
  source,
  JSON.parse(text),
  format as "html" | "revealjs",
);
