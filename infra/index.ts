import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import { config } from "dotenv";

const env = config({ path: "./api/.env.dev" });

const vpc = new awsx.ec2.Vpc("cal", {
  cidrBlock: "10.0.0.0/16",
});

const sg = new aws.ec2.SecurityGroup("webserver-sg", {
  vpcId: vpc.vpcId,
  ingress: [
    {
      description: "allow HTTP access from anywhere",
      fromPort: 80,
      toPort: 80,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"],
    },
    {
      description: "allow HTTPS access from anywhere",
      fromPort: 443,
      toPort: 443,
      protocol: "tcp",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
  egress: [
    {
      fromPort: 0,
      toPort: 0,
      protocol: "-1",
      cidrBlocks: ["0.0.0.0/0"],
    },
  ],
});

const repository = new awsx.ecr.Repository("repository", {});

const image = new awsx.ecr.Image("cal-api-image", {
  repositoryUrl: repository.url,
  dockerfile: "./api/Dockerfile",
  path: "../",
});

const cluster = new aws.ecs.Cluster("cluster", {});

const lb = new awsx.lb.ApplicationLoadBalancer("lb", {
  securityGroups: [sg.id],
  subnetIds: vpc.publicSubnetIds,
  defaultTargetGroup: { healthCheck: { matcher: "200-299" }, port: 80, protocol: "HTTP" },
  listeners: [
    {
      port: 80,
      protocol: "HTTP",
      defaultActions: [
        {
          type: "redirect",
          redirect: {
            protocol: "HTTPS",
            port: "443",
            statusCode: "HTTP_301",
          },
        },
      ],
    },
    {
      port: 443,
      protocol: "HTTPS",
      certificateArn:
        "arn:aws:acm:eu-central-1:968222268162:certificate/7cc4e3c6-ae73-44ac-9c9b-82f7e470f610",
    },
  ],
});

const logGroup = new aws.cloudwatch.LogGroup("cal-api-log-group");
const logStream = new aws.cloudwatch.LogStream("cal-api-log-stream", {
  logGroupName: logGroup.name,
});
const service = new awsx.ecs.FargateService("service", {
  cluster: cluster.arn,
  networkConfiguration: {
    subnets: vpc.privateSubnetIds,
    securityGroups: [sg.id],
    assignPublicIp: true,
  },
  desiredCount: 2,
  taskDefinitionArgs: {
    logGroup: { skip: true },
    runtimePlatform: {
      cpuArchitecture: "ARM64",
    },
    container: {
      name: "test-api",
      image: image.imageUri,
      cpu: 512,
      memory: 400,
      essential: true,
      portMappings: [
        {
          containerPort: 80,
          hostPort: 80,
          targetGroup: lb.defaultTargetGroup,
        },
      ],
      logConfiguration: {
        logDriver: "awslogs",
        options: {
          "awslogs-group": logGroup.name,
          "awslogs-stream-prefix": "cal-api",
          "awslogs-region": "eu-central-1",
        },
      },
      environment: env.parsed
        ? Object.keys(env.parsed).reduce((acc, key) => {
            if (env?.parsed?.[key]) return [...acc, { name: key, value: env?.parsed?.[key] }];
            return acc;
          }, [] as { name: string; value: string }[])
        : [],
    },
  },
});

const zoneId = aws.route53.getZone({ name: "api.cloud.cal.dev" }).then((zone) => zone.zoneId);

new aws.route53.Record("testapi", {
  name: "api.cloud.cal.dev",
  type: "A",
  zoneId: zoneId,
  aliases: [
    {
      name: lb.loadBalancer.dnsName,
      zoneId: lb.loadBalancer.zoneId,
      evaluateTargetHealth: true,
    },
  ],
});

export const url = lb.loadBalancer.dnsName;
export const apiPublicUrl = "api.cloud.cal.dev";
