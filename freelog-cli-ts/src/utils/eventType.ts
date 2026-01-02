export const eventTypes = [
  {
    code: "S101",
    name: "SigningEvent",
    description: "acknowledge a resource",
    params: [
      {
        name: "resourceName",
        nameCn: "资源名称",
        type: "string",
        typeCn: "字符串",
      },
    ],
    singleton: true,
  },
  {
    code: "A101",
    name: "CycleEndEvent",
    description: "raise when n cycle ends",
    params: [
      {
        name: "cycleCount",
        nameCn: "周期数量",
        type: "decimal",
        typeCn: "小数",
      },
      {
        name: "timeUnit",
        nameCn: "时间单位",
        type: "timeUnit",
        typeCn: "时间单位",
        enum: ["year", "month", "week", "day", "cycle"],
      },
    ],
    singleton: false,
  },
  {
    code: "S201",
    name: "TransactionEvent",
    description: "one time transaction",
    params: [
      {
        name: "amount",
        nameCn: "金额",
        type: "decimal",
        typeCn: "小数",
      },
      {
        name: "account",
        nameCn: "账户",
        type: "none",
        typeCn: "无",
      },
    ],
    singleton: true,
  },
  {
    code: "S202",
    name: "SettlementEvent",
    description: "fired when settlement cleared",
    params: [
      {
        name: "account",
        nameCn: "账户",
        type: "none",
        typeCn: "无",
      },
    ],
    singleton: true,
  },
  {
    code: "A102",
    name: "TimeEvent",
    description: "fired on a pre-determined time",
    params: [
      {
        name: "dateTime",
        nameCn: "日期时间",
        type: "dateTime",
        typeCn: "日期时间",
      },
    ],
    singleton: false,
  },
  {
    code: "A103",
    name: "RelativeTimeEvent",
    description: "fired when certain amount of time elapsed",
    params: [
      {
        name: "elapsed",
        nameCn: "经过时间",
        type: "decimal",
        typeCn: "小数",
      },
      {
        name: "timeUnit",
        nameCn: "时间单位",
        type: "timeUnit",
        typeCn: "时间单位",
        enum: ["year", "month", "week", "day", "cycle", "hour", "minute"],
      },
    ],
    singleton: false,
  },
  {
    code: "S301",
    name: "ViewCountEvent",
    description:
      "reserve a target number of authorizations, fires when such number reached",
    params: [
      {
        name: "amount",
        nameCn: "数量",
        type: "decimal",
        typeCn: "小数",
      },
    ],
    singleton: true,
  },
  {
    code: "S302",
    name: "ReContractCountEvent",
    description: "",
    params: [
      {
        name: "amount",
        nameCn: "数量",
        type: "decimal",
        typeCn: "小数",
      },
    ],
    singleton: true,
  },
  {
    code: "S303",
    name: "PresentCountEvent",
    description: "",
    params: [
      {
        name: "amount",
        nameCn: "数量",
        type: "decimal",
        typeCn: "小数",
      },
    ],
    singleton: true,
  },
  {
    code: "S210",
    name: "EscrowExceedAmount",
    description: "",
    params: [
      {
        name: "account",
        nameCn: "账户",
        type: "none",
        typeCn: "无",
      },
      {
        name: "amount",
        nameCn: "金额",
        type: "decimal",
        typeCn: "小数",
      },
      {
        name: "currencyUnit",
        nameCn: "货币单位",
        type: "string",
        typeCn: "字符串",
        enum: ["feather", "dollar", "yuan", "jiao", "fen"],
      },
    ],
    singleton: true,
  },
  {
    code: "S211",
    name: "EscrowConfiscated",
    description: "",
    params: [
      {
        name: "account",
        nameCn: "账户",
        type: "none",
        typeCn: "无",
      },
    ],
    singleton: true,
  },
  {
    code: "S212",
    name: "EscrowRefunded",
    description: "",
    params: [
      {
        name: "account",
        nameCn: "账户",
        type: "none",
        typeCn: "无",
      },
    ],
    singleton: true,
  },
];
