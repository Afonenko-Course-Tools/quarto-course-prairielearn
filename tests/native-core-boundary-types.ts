// Только статическая проверка реального public Core и сохранения parse outputs.
import type * as Core from "course-core/public.ts";
import type {
  ArtifactInventory,
  NativeAdapterValidationInput,
  NativeOperationIdentity,
  NativePreparedOperation,
} from "course-core/public.ts";
import type { PublicCore } from "../_extensions/course-prairielearn/application/native-adapter.ts";
import type { nativeBusinessInput } from "../_extensions/course-prairielearn/application/native-input.ts";
import type { nativePreparedRequest } from "../_extensions/course-prairielearn/application/native-adapter.ts";

type IsAny<T> = 0 extends (1 & T) ? true : false;
type Exact<A, B> = IsAny<A> extends true ? false
  : IsAny<B> extends true ? false
  : [A, B] extends [B, A] ? true
  : false;
type Require<T extends true> = T;

// Producer совместим с consumer без assertions и отдельной копии API.
declare const core: typeof Core;
const supplied: PublicCore = core;
void supplied;

type _Input = Require<
  Exact<
    ReturnType<typeof nativeBusinessInput>["input"],
    NativeAdapterValidationInput
  >
>;
type _Inventory = Require<
  Exact<
    ReturnType<PublicCore["ArtifactInventorySchema"]["parse"]>,
    ArtifactInventory
  >
>;
type _Identity = Require<
  Exact<
    ReturnType<PublicCore["NativeOperationIdentitySchema"]["parse"]>,
    NativeOperationIdentity
  >
>;
type _Prepared = Require<
  Exact<
    ReturnType<PublicCore["NativePreparedOperationSchema"]["parse"]>,
    NativePreparedOperation
  >
>;
type _RequestIdentity = Require<
  Exact<
    Awaited<ReturnType<typeof nativePreparedRequest>>["identity"],
    NativeOperationIdentity
  >
>;
type _RequestInputs = Require<
  Exact<
    Awaited<ReturnType<typeof nativePreparedRequest>>["inputs"],
    NativePreparedOperation["inputs"]
  >
>;
