# 发布主题插件流程设计

## 获取线上作品信息

freelog-cli pull 把线上的作品信息同步到本地，写入到 freelog.json 文件中
需要有个参数--workId 根据 workId 来请求作品信息，并写入到 freelog.json 文件中

例如：freelog-cli pull -w 61d6959a7841ed002e5d526e，然后获取或生成一个 freelog.json 文件并写入作品信息

## 上传文件： https://api.testfreelog.com/v2/storages/files/upload file

## 发行数据如下

api:  https://api.testfreelog.com/v2/resources/674d1d3d330631002f1018d8/versions

```ts
const obj = {
  version: "1.0.0",
  fileSha1: "3ace59ea965a864f81a71526f85631813f6a2aa4",
  filename: "dist.zip",
  baseUpcastResources: [],
  dependencies: [
    {
      resourceId: "67194a3de708620030136267",
      versionRange: "^1.0.22",
    },
  ],
  resolveResources: [
    {
      resourceId: "67194a3de708620030136267",
      contracts: [{ policyId: "f182dbabc6e4b24e88a9d1998cb13589" }],
    },
  ],
  inputAttrs: [],
  customPropertyDescriptors: [
    {
      type: "editableText",
      key: "options_a",
      name: "阿帆",
      remark: "afasdf",
      defaultValue: "adfasdf",
    },
    {
      type: "select",
      key: "options_dd",
      name: "asdf",
      remark: "dafassdf",
      defaultValue: "asdf",
      candidateItems: ["asdf", "asdfd", "dsfafd"],
    },
  ],
  description: "<p>asdfasdf asdfasfasfdasddf</p>",
};

{
    "version": "1.0.1",
    "fileSha1": "3ace59ea965a864f81a71526f85631813f6a2aa4",
    "filename": "dist.zip",
    "baseUpcastResources": [],
    "dependencies": [
        {
            "resourceId": "67194a3de708620030136267",
            "versionRange": "^1.0.22"
        }
    ],
    "resolveResources": [
        {
            "resourceId": "67194a3de708620030136267",
            "contracts": [
                {
                    "policyId": "f182dbabc6e4b24e88a9d1998cb13589"
                }
            ]
        }
    ],
    "inputAttrs": [],
    "customPropertyDescriptors": [
        {
            "type": "editableText",
            "key": "options_a",
            "name": "阿帆",
            "remark": "afasdf",
            "defaultValue": "adfasdf"
        },
        {
            "type": "select",
            "key": "options_dd",
            "name": "asdf",
            "remark": "dafassdf",
            "defaultValue": "asdf",
            "candidateItems": [
                "asdf",
                "asdfd",
                "dsfafd"
            ]
        }
    ],
    "description": "<p>asdfasdf asdfasfasfdasddf</p>"
}
```

## 草稿数据如下

api: https://api.testfreelog.com/v2/resources/674d1d3d330631002f1018d8/versions/drafts

```ts
{
    "resourceId": "674d1d3d330631002f1018d8",
    "draftData": {
        "versionInput": "1.0.1",
        "selectedFileInfo": {
            "name": "dist.zip",
            "sha1": "3ace59ea965a864f81a71526f85631813f6a2aa4",
            "from": "上个版本"
        },
        "additionalProperties": [],
        "customProperties": [],
        "customConfigurations": [
            {
                "key": "options_a",
                "name": "阿帆",
                "description": "afasdf",
                "type": "input",
                "input": "adfasdf",
                "select": []
            },
            {
                "key": "options_dd",
                "name": "asdf",
                "description": "dafassdf",
                "type": "select",
                "input": "asdf",
                "select": [
                    "asdf",
                    "asdfd",
                    "dsfafd"
                ]
            }
        ],
        "directDependencies": [
            {
                "id": "67194a3de708620030136267",
                "name": "suibn/test20241024-03-10-48",
                "type": "resource",
                "versionRange": "^1.0.22"
            }
        ],
        "baseUpcastResources": [],
        "descriptionEditorInput": "<p>asdfasdf asdfasfasfdasddf</p>"
    }
}
```

## freelog.json 定义

1.workId: 作品 id
2.version: 版本号 发布时线上检查版本号是否大于等于本地版本号，如果大于等于则提示版本号冲突
3.systemPropertyDescriptors: 系统属性
{
"Title: "标题",
"intro: "简介"
} 4.


## 1.预先创建授权条目

1.同步线上作品信息：必须有命令获取当前作品的线上版本信息（发布前是否需要再获取一次？还是线上进行比对？）
当线上版本跟本地脚手架保存的版本 2.

## 2.提交资源文件

### 2.1 添加可选配置

是否要能添加必选配置？

脚手架发布前必须核对线上版本是否

### 2.2 添加依赖声明






{
    "version": "1.0.1",
    "fileSha1": "8104bc1c9275e2070578b65f09fa3466411e2883",
    "filename": "dist.zip",
    "baseUpcastResources": [],
    "dependencies": [],
    "resolveResources": [],
    "inputAttrs": [],
    "customPropertyDescriptors": [
        {
            "type": "select",
            "key": "options_list",
            "name": "下拉列表",
            "remark": "下拉列表",
            "defaultValue": "1",
            "candidateItems": [
                "1",
                "2",
                "3",
                "4"
            ]
        },
        {
            "type": "editableText",
            "key": "options_text",
            "name": "文本",
            "remark": "文本",
            "defaultValue": "text"
        }
    ],
    "description": ""
}