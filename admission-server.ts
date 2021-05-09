import { JSONValue } from "https://deno.land/x/kubernetes_apis@v0.3.1/common.ts";
import { AdmissionRequest, AdmissionResponse, AdmissionReview, fromAdmissionReview, toAdmissionReview } from "./admission-review.ts";

const repoUrl = `https://github.com/cloudydeno/kubernetes-aws-identity-webhook`;

export class AdmissionServer {
  constructor(
    public callback: (req: AdmissionRequest<JSONValue>) => AdmissionResponse | Promise<AdmissionResponse>,
    public metadata: {
      name: string;
      type: 'MutatingWebhook' | 'ValidatingWebhook';
      repo: string;
      rules: string;
    },
  ) {}

  registerFetchEvent() {
    addEventListener("fetch", async (event) => {
      const request = (event as any).request as Request;
      const response = await this.handleRequest(request).catch(err => {
        const msg = err.stack || err.message || JSON.stringify(err);
        console.error('!!!', msg);
        return new Response(`Internal Error!\n${msg}`, {status: 500});
      });
      response.headers.set("server", `kubernetes-aws-identity-webhook/0.1.0`);
      await (event as any).respondWith(response);
    });
  }

  async handleRequest(request: Request) {
    const {pathname, origin, hostname} = new URL(request.url);

    if (pathname === "/webhook-config.yaml") {
      const yaml = `
apiVersion: admissionregistration.k8s.io/v1
kind: ${this.metadata.type}Configuration
metadata:
  name: '${this.metadata.name}'
  labels:
    app: '${this.metadata.name}'
  annotations:
    repo: '${this.metadata.repo}'
webhooks:
- admissionReviewVersions:
  - v1
  clientConfig:
    url: '${origin}/admission-webhook'
  failurePolicy: Fail
  matchPolicy: Exact
  name: '${hostname}'
  reinvocationPolicy: IfNeeded
  rules: ${this.metadata.rules}
  sideEffects: None`.slice(1);
      return new Response(yaml);
    }

    if (pathname !== "/admission-webhook") return new Response(
      `This is a webhook server specifically for Kubernetes AdmissionReview purposes.
$ kubectl apply -f "${origin}/webhook-config.yaml"
See also: ${repoUrl}`,
      { status: 404 });

    if (request.method !== "POST") return new Response(
      "Method Not Allowed. This is a webhook endpoint.",
      { status: 405 });

    if (request.headers.get("content-type") !== 'application/json') return new Response(
      "Please provide 'content-type: application/json' header",
      { status: 400 });

    const json = await request.json();
    for (const slice of JSON.stringify(json).matchAll(/.{1,2000}/g)) {
      console.log('Input chunk:', slice[0]);
    }

    const rawReviewReq = toAdmissionReview(json);
    if (!rawReviewReq.request?.uid) return new Response(
      "I didn't see a request in your review payload :/",
      { status: 400 });

    const responseReq: AdmissionReview = {
      apiVersion: "admission.k8s.io/v1",
      kind: "AdmissionReview",
      response: await this.callback(rawReviewReq.request),
    };

    const respJson = fromAdmissionReview(responseReq);
    return new Response(JSON.stringify(respJson, null, 2), {
      headers: {
        "Content-Type": "application/json",
      }});
  }

}
