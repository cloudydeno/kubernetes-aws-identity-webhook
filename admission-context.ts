import type {
  JsonPatchOp,
} from "https://deno.land/x/kubernetes_apis@v0.3.1/common.ts";
import type {
  AdmissionRequest, AdmissionResponse,
} from "./admission-review.ts";

export interface WebhookRule {
  operations: Array<"CREATE" | "UPDATE" | "DELETE" | "CONNECT">;
  scope: "*" | "Cluster" | "Namespaced";
  apiGroups: Array<string>;
  apiVersions: Array<string>;
  resources: Array<string>;
  callback: (ctx: AdmissionContext) => void | Promise<void>,
}

export class AdmissionContext {
  constructor(
    public request: AdmissionRequest,
  ) {
    this.response = {
      uid: request.uid,
      allowed: true,
    };
  }
  response: AdmissionResponse;

  jsonPatches = new Array<JsonPatchOp>();
  addPatch(patch: JsonPatchOp) {
    this.jsonPatches.push(patch);
  }

  getResponse(): AdmissionResponse {
    if (this.jsonPatches.length > 0) {
      this.response.patch = new TextEncoder().encode(JSON.stringify(this.jsonPatches));
      this.response.patchType = 'JSONPatch';
    }
    return this.response;
  }

  async applyHooks(rules: WebhookRule[]) {
    for (const hook of rules) {
      if (!hook.operations.includes(this.request.operation as any)) continue;
      if (!hook.apiGroups.includes(this.request.resource.group)) continue;
      if (!hook.apiVersions.includes(this.request.resource.version)) continue;
      if (!hook.resources.includes(this.request.resource.resource)) continue;
      await hook.callback(this);
    }
  }

  log(...args: unknown[]) {
    const { group, version, resource } = this.request.resource;
    const { operation, namespace, name } = this.request;
    console.log(operation,
      `[${group||'core'}.${version}/${resource} ${namespace||'-'}/${name||'-'}]`,
      ...args);
  }
}
