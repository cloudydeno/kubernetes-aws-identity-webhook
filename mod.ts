import * as CoreV1 from "https://deno.land/x/kubernetes_apis@v0.3.1/builtin/core@v1/structs.ts";
import { JsonPatch } from "https://deno.land/x/kubernetes_apis@v0.3.1/common.ts";
import { AdmissionRequest, transformAdmissionRequest } from "./admission-review.ts";
import { AdmissionServer } from "./admission-server.ts";

new AdmissionServer(raw => {
  let allowed = true;
  const patches: JsonPatch = [];

  // make a proprietary token to allow easy switching
  switch ([raw.kind.group || 'core', raw.kind.version, raw.kind.kind].join('/')) {

    case 'core/v1/Pod': {
      const request = transformAdmissionRequest(raw, CoreV1.toPod);
      appendPodPatches(request, patches);
      console.log(`Patches for ${request.namespace}/${request.name}: ${JSON.stringify(patches)}`);
    }; break;

  }

  return {
    uid: raw.uid,
    allowed,
    patch: patches.length > 0 ? new TextEncoder().encode(JSON.stringify(patches)) : null,
    patchType: patches.length > 0 ? 'JSONPatch' : null,
  };
}).registerFetchEvent();

function appendPodPatches(request: AdmissionRequest<CoreV1.Pod>, patches: JsonPatch) {

  if (request.operation !== 'CREATE') return;

  const roleArn = request.object?.metadata?.annotations?.['sts.amazonaws.com/role-arn'];
  if (!roleArn) return;
  // From here down, we know we want to make pod identity happen

  // TODO: all kinds of configurability :)
  const awsRegion = "us-west-2";
  const tokenAudience = "sts.amazonaws.com";
  const tokenLifetimeSecs = 86400;
  const mountPoint = "/var/run/secrets/sts.amazonaws.com/serviceaccount";
  const volumeName = "aws-sts-token";

  const desiredMount: CoreV1.VolumeMount = {
    name: volumeName,
    readOnly: true,
    mountPath: mountPoint,
  };
  const desiredEnvs: Array<CoreV1.EnvVar> = [{
    name: "AWS_DEFAULT_REGION",
    value: awsRegion,
  }, {
    name: "AWS_REGION",
    value: awsRegion,
  }, {
    name: "AWS_STS_REGIONAL_ENDPOINTS",
    value: "regional",
  }, {
    name: "AWS_ROLE_ARN",
    value: roleArn, // "arn:aws:iam::<account>:role/<role>"
  }, {
    name: "AWS_WEB_IDENTITY_TOKEN_FILE",
    value: `${mountPoint}/token`,
  }, {
    name: "AWS_ROLE_SESSION_NAME",
    valueFrom: {
      fieldRef: {
        fieldPath: "metadata.name",
      },
    },
  }];

  request.object?.spec?.containers.forEach((container, idx) => {
    appendContainerPatches({
      container,
      desiredEnvs, desiredMount,
      patches, patchPath: `/spec/containers/${idx}`,
    });
  });

  request.object?.spec?.initContainers?.forEach((container, idx) => {
    appendContainerPatches({
      container,
      desiredEnvs, desiredMount,
      patches, patchPath: `/spec/initContainers/${idx}`,
    });
  });

  const hasVolume = request.object?.spec?.volumes?.some(x => x.name === 'aws-sts-token');
  if (!hasVolume) patches.push({
    op: "add",
    path: "/spec/volumes/-",
    value: CoreV1.fromVolume({
      name: volumeName,
      projected: {
        sources: [{
          serviceAccountToken: {
            audience: tokenAudience,
            expirationSeconds: tokenLifetimeSecs,
            path: "token",
          }
        }]
      }}),
  });
}

function appendContainerPatches(opts: {
  container: CoreV1.Container;
  patches: JsonPatch;
  patchPath: string;
  desiredMount: CoreV1.VolumeMount;
  desiredEnvs: Array<CoreV1.EnvVar>;
}) {

  const hasVolume = opts.container.volumeMounts?.some(x => x.name === opts.desiredMount.name);
  if (!hasVolume) opts.patches.push({
    op: "add",
    path: `${opts.patchPath}/volumeMounts/-`,
    value: CoreV1.fromVolumeMount(opts.desiredMount),
  });

  if (opts.container.env) {
    const hasEnvs = new Set(opts.container.env?.map(x => x.name));
    for (const envVar of opts.desiredEnvs) {
      if (hasEnvs.has(envVar.name)) continue;
      opts.patches.push({
        op: "add",
        path: `${opts.patchPath}/env/-`,
        value: CoreV1.fromEnvVar(envVar),
      });
    }
  } else {
    opts.patches.push({
      op: "add",
      path: `${opts.patchPath}/env`,
      value: opts.desiredEnvs.map(CoreV1.fromEnvVar),
    });
  }
}
