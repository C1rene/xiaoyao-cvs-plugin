/*
* 请勿直接修改此文件，可能会导致后续更新冲突
* 如需自定义可将文件复制一份，重命名为 help-cfg.js 后编辑
*/

export const helpCfg = {
  title: "图鉴帮助",
  subTitle: "Yunzai-Bot & xiaoyao-cvs-Plugin"
};

export const helpList = [
  {
    group: "信息查询",
    list: [
      { icon: 61, title: "#角色图鉴", desc: "查询原神角色资料" },
      { icon: 66, title: "#武器图鉴", desc: "查询原神武器资料" },
      { icon: 71, title: "#食谱图鉴", desc: "查询原神食谱资料" },
      { icon: 74, title: "#怪物图鉴", desc: "查询原神怪物资料" },
      { icon: 63, title: "#圣遗物图鉴", desc: "查询原神圣遗物资料" },
      { icon: 75, title: "#希儿图鉴", desc: "查询星穹铁道角色资料" }
    ]
  },
  {
    group: "账号与Stoken功能",
    list: [
      { icon: 76, title: "#扫码登录", desc: "扫码绑定米哈游账号" },
      { icon: 75, title: "#我的stoken", desc: "查看已绑定的Stoken" },
      { icon: 92, title: "#刷新ck", desc: "使用已绑定的Stoken刷新Cookie" },
      { icon: 75, title: "#更新抽卡记录", desc: "更新或获取抽卡记录" },
      { icon: 76, title: "#ck查询", desc: "查看已绑定的游戏UID" }
    ]
  },
  {
    group: "管理命令，仅管理员可用",
    auth: "master",
    list: [
      { icon: 57, title: "#图鉴设置", desc: "设置图鉴匹配、星铁图鉴及扫码绑定等功能" },
      { icon: 60, title: "#图鉴插件更新", desc: "更新插件代码" }
    ]
  }
];
