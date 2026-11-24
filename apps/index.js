import lodash from "lodash";
import {
	AtlasAlias, getBasicVoide
} from "./xiaoyao_image.js";
import { srAtlasAlias } from './srGallery.js';
import {
	versionInfo,
	help
} from "./help.js";
import {
	rule as adminRule,
	sysCfg,
	updateMiaoPlugin
} from "./admin.js";
import {
	rule as userRule,
	delStoken,
	updCookie,
	userInfo,
	gclog,
	mytoken,
	gcPaylog,
	srPaylog,
	bindStoken,
	bindLogin_ticket,
	cookiesDocHelp
} from "./user.js";
import {
	rule as topupLoginRule,
	qrCodeLogin,
	UserPassMsg,
	UserPassLogin
} from './mhyTopUpLogin.js';

export {
	delStoken,
	gcPaylog,
	srPaylog,
	qrCodeLogin,
	bindLogin_ticket,
	UserPassMsg,
	UserPassLogin,
	gclog,
	mytoken,
	getBasicVoide,
	bindStoken,
	updateMiaoPlugin,
	userInfo,
	versionInfo,
	sysCfg,
	help,
	updCookie,
	AtlasAlias,
	srAtlasAlias,
	cookiesDocHelp
};

let rule = {
	versionInfo: {
		reg: "^#图鉴版本$",
		describe: "【#帮助】 图鉴版本介绍",
	},
	help: {
		reg: "^#?(图鉴)?(命令|帮助|菜单|help|说明|功能|指令|使用说明)$",
		describe: "查看插件的功能",
	},
	AtlasAlias: {
		reg: "^(#(.*)|.*图鉴)$",
		describe: "角色、食物、怪物、武器信息图鉴",
	},
	srAtlasAlias: {
		reg: "^((#|\\*)(.*)|.*图鉴)$",
		describe: "sr 星穹铁道武器信息图鉴",
	},
	getBasicVoide: {
		reg: '#?(动态|幻影)',
		describe: "动态",
	},
	...userRule,
	...adminRule,
	...topupLoginRule
};

lodash.forEach(rule, (r) => {
	r.priority = r.priority || 50;
	r.prehash = true;
	r.hashMark = true;
});

export { rule };
