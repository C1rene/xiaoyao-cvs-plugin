#### 介绍
# xiaoyao-cvs-plugin

yunzai-bot扩展图鉴; 

项目仅供学习交流使用，严禁用于任何商业用途和非法行为

#### 介绍

原神星铁图鉴插件。

#### 软件架构
由逍遥自行制作的原神图鉴，按业务分类整理。图片更新时替换对应路径的文件，保持图片url不变~
其余功能支持：stoken相关功能支持、扫码登录

#### 安装教程
使用github
```
git clone --depth=1 https://github.com/C1rene/xiaoyao-cvs-plugin.git ./plugins/xiaoyao-cvs-plugin/
```


#### 使用说明
 配合云崽使用： https://gitee.com/Le-niao/Yunzai-Bot
 
 配合喵崽使用： https://gitee.com/yoimiya-kokomi/Miao-Yunzai.git
 
 配合TRSS崽使用： https://gitee.com/TimeRainStarSky/Yunzai
 
#### 命令说明
1. 发送 【#**信息】 进行触发，例如发送 #刻晴信息，即可返回对应的图片信息。
2. 发送 【#图鉴插件更新】获取最新代码。
3. 别名文件在 /xiaoyao-cvs-plugin/resources/Atlas_alias 目录下面，当前只支持武器、食物、原魔、七圣召唤的别名。
4. 发送 #图鉴帮助 获取帮助面板。
5. 发送 #图鉴设置 获取图鉴管理面板。(如果图鉴喊不出来，大概率是没开设置)
6. 发送 #图鉴版本 获取图鉴更新日志。
7. 其余具体功能通过 #图鉴帮助 #图鉴版本 查看。
8. 默认配置文件位于 ./plugins/xiaoyao-cvs-plugin/defSet/config/config.yaml
9. 支持stoken绑定以及相关的操作。如：【#更新抽卡记录】
