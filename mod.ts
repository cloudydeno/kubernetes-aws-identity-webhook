import * as CoreV1 from "https://deno.land/x/kubernetes_apis@v0.3.1/builtin/core@v1/structs.ts";
import { AdmissionContext, AdmissionServer } from "https://deno.land/x/kubernetes_admission@v0.1.0/mod.ts";

new AdmissionServer({
  name: 'aws-identity-webhook',
  repo: 'https://github.com/cloudydeno/kubernetes-aws-identity-webhook',
}).withMutatingRule({
  operations: ['CREATE'],
  apiGroups: [''],
  apiVersions: ['v1'],
  resources: ['pods'],
  scope: '*',
  callback(ctx) {
    const pod = CoreV1.toPod(ctx.request.object);
    const roleArn = pod.metadata?.annotations?.['sts.amazonaws.com/role-arn'];
    if (roleArn) {
      ctx.log(`Discovered role-arn: ${roleArn}`);
      appendPodPatches(ctx, pod, roleArn);
    } else {
      ctx.log(`No role-arn annotation found; skipping`);
    }
  },
}).serve();

function appendPodPatches(ctx: AdmissionContext, pod: CoreV1.Pod, roleArn: string) {
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

  pod.spec?.containers.forEach((container, idx) => {
    appendContainerPatches(ctx, {
      container,
      desiredEnvs, desiredMount,
      patchPath: `/spec/containers/${idx}`,
    });
  });

  pod.spec?.initContainers?.forEach((container, idx) => {
    appendContainerPatches(ctx, {
      container,
      desiredEnvs, desiredMount,
      patchPath: `/spec/initContainers/${idx}`,
    });
  });

  const hasVolume = pod.spec?.volumes?.some(x => x.name === 'aws-sts-token');
  if (!hasVolume) ctx.addPatch({
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

function appendContainerPatches(ctx: AdmissionContext, opts: {
  container: CoreV1.Container;
  patchPath: string;
  desiredMount: CoreV1.VolumeMount;
  desiredEnvs: Array<CoreV1.EnvVar>;
}) {

  const hasVolume = opts.container.volumeMounts?.some(x => x.name === opts.desiredMount.name);
  if (!hasVolume) ctx.addPatch({
    op: "add",
    path: `${opts.patchPath}/volumeMounts/-`,
    value: CoreV1.fromVolumeMount(opts.desiredMount),
  });

  if (opts.container.env) {
    const hasEnvs = new Set(opts.container.env?.map(x => x.name));
    for (const envVar of opts.desiredEnvs) {
      if (hasEnvs.has(envVar.name)) continue;
      ctx.addPatch({
        op: "add",
        path: `${opts.patchPath}/env/-`,
        value: CoreV1.fromEnvVar(envVar),
      });
    }
  } else {
    ctx.addPatch({
      op: "add",
      path: `${opts.patchPath}/env`,
      value: opts.desiredEnvs.map(CoreV1.fromEnvVar),
    });
  }
}
