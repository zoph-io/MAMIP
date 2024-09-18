[
  {
    "logConfiguration": {
      "logDriver": "awslogs",
      "options": {
        "awslogs-group": "/ecs/${project}-${env}",
        "awslogs-region": "${aws_region}",
        "awslogs-stream-prefix": "ecs"
      }
    },
    "image": "${container_image}",
    "name": "${project}-${env}-container",
    "runtimePlatform": {
      "operatingSystemFamily": "LINUX",
      "cpuArchitecture": "ARM64"
    },
    "environment": [
      {
        "name": "Environment",
        "value": "${env}"
      }
    ],
    "mountPoints": [],
    "volumesFrom": [],
    "essential": true
  }
]
