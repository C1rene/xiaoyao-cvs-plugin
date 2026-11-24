import fs from "fs";
import lodash from "lodash";
import {
	createRequire
} from "module";
import {
	exec
} from "child_process";
import {
	Cfg
} from "../components/index.js";
import Common from "../components/Common.js";

let cfgMap = {
	"帮助": "sys.help",
	"匹配": "sys.Atlas",
	"获取sk":"ck.sk",
	"目录":"Atlas.all",
	"扫码绑定":'mhy.qrcode',
	"星铁图鉴":'sr.Search',
	"星铁匹配":'sr.Atlas'
};
let sysCfgReg = `^#图鉴设置\s*(${lodash.keys(cfgMap).join("|")})?\s*(.*)$`;
export const rule = {
	updateMiaoPlugin: {
		hashMark: true,
		reg: "^#图鉴插件(强制)?更新",
		describe: "【#管理】图鉴更新",
	},
	sysCfg: {
		hashMark: true,
		reg: sysCfgReg,
		describe: "【#管理】系统设置"
	}
};


const _path = process.cwd();
export async function sysCfg(e, {
	render
}) {
	if (!await checkAuth(e)) {
		return true;
	}

	let cfgReg = new RegExp(sysCfgReg);
	let regRet = cfgReg.exec(e.msg);

	if (!regRet) {
		return true;
	}

	if (regRet[1]) {

		// 设置模式
		let val = regRet[2] || "";
		
		let cfgKey = cfgMap[regRet[1]];

		if (cfgKey === "sys.scale") {
			val = Math.min(200, Math.max(50, val * 1 || 100));
		}else if(cfgKey==='mhy.qrcode'){
			val= Math.min(3,Math.max(val,0));
		} else {
			val = !/关闭/.test(val);
		}

		if (cfgKey) {
			Cfg.set(cfgKey, val);
		}
	}
	let cfg = {
		help: getStatus("sys.help", false),
		Atlas: getStatus("sys.Atlas",false),
		isSk: getStatus("ck.sk",false),
		qrcode:Cfg.get("mhy.qrcode", 0),
		bg: await rodom(), //获取底图
		Atlasall:getStatus("Atlas.all",false),
		srAtlas:getStatus("sr.Atlas",false),
		srSearch:getStatus("sr.Search",false),
	}
	//渲染图像
	return await Common.render("admin/index", {
		...cfg,
	}, {
		e,
		render,
		scale: 1.4
	});
}

const rodom = async function() {
	var image = fs.readdirSync(`./plugins/xiaoyao-cvs-plugin/resources/admin/imgs/bg`);
	var list_img = [];
	for (let val of image) {
		list_img.push(val)
	}
	var imgs = list_img.length == 1 ? list_img[0] : list_img[lodash.random(0, list_img.length - 1)];
	return imgs;
}

const checkAuth = async function(e) {
	return await e.checkAuth({
		auth: "master",
		replyMsg: `只有主人才能命令我哦~
    (*/ω＼*)`
	});
}
const getStatus = function(rote, def = true) {
	if (Cfg.get(rote, def)) {
		return `<div class="cfg-status" >已开启</div>`;
	} else {
		return `<div class="cfg-status status-off">已关闭</div>`;
	}

}

let timer;

export async function updateMiaoPlugin(e) {
	if (!await checkAuth(e)) {
		return true;
	}
	let isForce = e.msg.includes("强制");
	let command = "git  pull";
	if (isForce) {
		command = "git  checkout . && git  pull";
		e.reply("正在执行强制更新操作，请稍等");
	} else {
		e.reply("正在执行更新操作，请稍等");
	}
	exec(command, {
		cwd: `${_path}/plugins/xiaoyao-cvs-plugin/`
	}, function(error, stdout, stderr) {
		//console.log(stdout);
		if (/Already up[ -]to[ -]date/.test(stdout)||stdout.includes("最新")) {
			e.reply("目前已经是最新版图鉴插件了~");
			return true;
		}
		if (error) {
			e.reply("图鉴插件更新失败！\nError code: " + error.code + "\n" + error.stack + "\n 请稍后重试。");
			return true;
		}
		e.reply("图鉴插件更新成功，尝试重新启动Yunzai以应用更新...");
		timer && clearTimeout(timer);
		timer = setTimeout(function() {
			let command = `npm run start`;
			if (process.argv[1].includes("pm2")) {
				command = `npm run restart`;
			}
			exec(command, function(error, stdout, stderr) {
				if (error) {
					e.reply("自动重启失败，请手动重启以应用新版图鉴插件。\nError code: " + error.code + "\n" +
						error.stack + "\n");
					Bot.logger.error('重启失败\n${error.stack}');
					return true;
				} else if (stdout) {
					Bot.logger.mark("重启成功，运行已转为后台，查看日志请用命令：npm run log");
					Bot.logger.mark("停止后台运行命令：npm stop");
					process.exit();
				}
			})
		}, 1000);

	});
	return true;
}
