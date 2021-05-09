import * as c from "https://deno.land/x/kubernetes_apis@v0.3.1/common.ts";
import * as MetaV1 from "https://deno.land/x/kubernetes_apis@v0.3.1/builtin/meta@v1/structs.ts";
import * as AuthnV1 from "https://deno.land/x/kubernetes_apis@v0.3.1/builtin/authentication.k8s.io@v1/mod.ts";

import * as Base64 from "https://deno.land/std@0.95.0/encoding/base64.ts";

// https://github.com/kubernetes/api/blob/master/admission/v1beta1/types.go
// This file looks like a normal /x/kubernetes_apis file, but it's actually handwritten
// Because AdmissionReview is never served by APIServer, the OpenAPI file completely excludes it

/** AdmissionReview is the primary payload that gets transfered in both directions */
export interface AdmissionReview {
  apiVersion?: "admission.k8s.io/v1";
  kind?: "AdmissionReview";
  request?: AdmissionRequest<c.JSONValue> | null;
  response?: AdmissionResponse | null;
}
export function toAdmissionReview(input: c.JSONValue): AdmissionReview & c.ApiKind {
  const obj = c.checkObj(input);
  return {
    ...c.assertOrAddApiVersionAndKind(obj, "admission.k8s.io/v1", "AdmissionReview"),
    request: c.readOpt(obj["request"], x => toAdmissionRequest(x, x => x)),
    response: c.readOpt(obj["response"], toAdmissionResponse),
  }}
export function fromAdmissionReview(input: AdmissionReview): c.JSONValue {
  return {
    ...c.assertOrAddApiVersionAndKind(input, "admission.k8s.io/v1", "AdmissionReview"),
    ...input,
    request: input.request != null ? fromAdmissionRequest(input.request, x => x) : undefined,
    response: input.response != null ? fromAdmissionResponse(input.response) : undefined,
  }}

export interface GroupVersionKind {
  group:   string;
  version: string;
  kind:    string;
}
export function toGroupVersionKind(input: c.JSONValue): GroupVersionKind {
  const obj = c.checkObj(input);
  return {
    group: c.checkStr(obj["group"]),
    version: c.checkStr(obj["version"]),
    kind: c.checkStr(obj["kind"]),
  }}

export interface GroupVersionResource {
  group:    string;
  version:  string;
  resource: string;
}
export function toGroupVersionResource(input: c.JSONValue): GroupVersionResource {
  const obj = c.checkObj(input);
  return {
    group: c.checkStr(obj["group"]),
    version: c.checkStr(obj["version"]),
    resource: c.checkStr(obj["resource"]),
  }}

/** AdmissionRequest is generic, to allow unwrapping the inner object (once you confirm `kind`!) */
export interface AdmissionRequest<T> {
  uid: string;
  kind: GroupVersionKind;
  resource: GroupVersionResource;
  subResource?: string | null;
  requestKind?: GroupVersionKind | null;
  requestResource?: GroupVersionResource | null;
  requestSubResource?: string | null;
  name?: string | null;
  namespace?: string | null;
  operation: "CREATE" | "UPDATE" | "DELETE" | "CONNECT" | c.UnexpectedEnumValue;
  userInfo: AuthnV1.UserInfo;
  object?: T | null;
  oldObject?: T | null;
  dryRun?: boolean | null;
  options?: unknown; // CreateOptions, etc
}
export function toAdmissionRequest<T>(input: c.JSONValue, objectMapper: (input: c.JSONValue) => T): AdmissionRequest<T> {
  const obj = c.checkObj(input);
  return {
    uid: c.checkStr(obj["uid"]),
    kind: toGroupVersionKind(c.checkObj(obj["kind"])),
    resource: toGroupVersionResource(c.checkObj(obj["resource"])),
    subResource: c.readOpt(obj["subResource"], c.checkStr),
    requestKind: c.readOpt(obj["requestKind"], x => toGroupVersionKind(c.checkObj(x))),
    requestResource: c.readOpt(obj["requestResource"], x => toGroupVersionResource(c.checkObj(x))),
    requestSubResource: c.readOpt(obj["requestSubResource"], c.checkStr),
    name: c.readOpt(obj["name"], c.checkStr),
    namespace: c.readOpt(obj["namespace"], c.checkStr),
    operation: c.readEnum(obj["operation"]),
    userInfo: AuthnV1.toUserInfo(c.checkObj(obj["userInfo"])),
    object: c.readOpt(obj["object"], objectMapper),
    oldObject: c.readOpt(obj["oldObject"], objectMapper),
    dryRun: c.readOpt(obj["dryRun"], c.checkBool),
    options: obj["options"],
  }}
export function fromAdmissionRequest<T>(input: AdmissionRequest<T>, objectMapper: (input: T) => c.JSONValue): c.JSONValue {
  return {
    ...input,
    kind: {...input.kind},
    resource: {...input.resource},
    requestKind: input.requestKind != null ? {...input.requestKind} : undefined,
    requestResource: input.requestResource != null ? {...input.requestResource} : undefined,
    userInfo: AuthnV1.fromUserInfo(input.userInfo),
    object: input.object != null ? objectMapper(input.object) : undefined,
    oldObject: input.oldObject != null ? objectMapper(input.oldObject) : undefined,
    options: input.options as c.JSONValue,
  }}

/** Re-interprets the object payloads within an AdmissionRequest. */
export function transformAdmissionRequest<T,U>(original: AdmissionRequest<T>, objectMapper: (input: T) => U): AdmissionRequest<U> {
  return {
    ...original,
    object: original.object ? objectMapper(original.object) : undefined,
    oldObject: original.oldObject ? objectMapper(original.oldObject) : undefined,
  };
}


/** AdmissionResponse ... */
export interface AdmissionResponse {
  uid: string;
  allowed: boolean;
  result?: MetaV1.Status | null;
  patch?: Uint8Array | null; // base64 encoded
  patchType?: 'JSONPatch' | c.UnexpectedEnumValue | null;
  auditAnnotations?: Record<string, string> | null;
  warnings?: Array<string> | null;
}
export function toAdmissionResponse(input: c.JSONValue): AdmissionResponse {
  const obj = c.checkObj(input);
  return {
    uid: c.checkStr(obj["uid"]),
    allowed: c.checkBool(obj["allowed"]),
    result: c.readOpt(obj["status"], MetaV1.toStatus),
    patch: c.readOpt(obj["patch"], x => Base64.decode(c.checkStr(x))),
    patchType: c.readOpt(obj["patchType"], x => c.readEnum<c.UnexpectedEnumValue>(x)),
    auditAnnotations: c.readOpt(obj["auditAnnotations"], x => c.readMap(x, c.checkStr)),
    warnings: c.readOpt(obj["warnings"], x => c.readList(x, c.checkStr)),
  }}
export function fromAdmissionResponse(input: AdmissionResponse): c.JSONValue {
  return {
    ...input,
    result: input.result != null ? MetaV1.fromStatus(input.result) : undefined,
    patch: input.patch != null ? Base64.encode(input.patch) : undefined,
  }}
