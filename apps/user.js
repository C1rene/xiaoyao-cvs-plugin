import utils from '../model/mys/utils.js';
import {
	Cfg
} from "../components/index.js";
import moment from 'moment';
import Common from "../components/Common.js";
import gsCfg from '../model/gsCfg.js';
import User from "../model/user.js"

export const rule = {
	userInfo: {
		reg: "^#*(ck|stoken|cookie|cookies)查询$",
		describe: "已绑定账号信息查询"
	},
	gclog: {
		reg: "^#*(更新|获取|导出)抽卡记录$",
		describe: "更新抽卡记录"
	},
	gcPaylog: {
		reg: "^#*(刷新|获取|导出)(充值|氪金)记录$",
		describe: "刷新充值记录"
	},
	srPaylog: {
		reg: "^(?:\\*(?:刷新|获取|导出)(?:充值|氪金|古老梦华)记录|#*(?:(?:星铁|星穹铁道)(?:刷新|获取|导出)(?:充值|氪金|古老梦华)记录|(?:刷新|获取|导出)(?:(?:星铁|星穹铁道)(?:充值|氪金)|古老梦华)记录))$",
		describe: "刷新星穹铁道古老梦华记录"
	},
	mytoken: {
		reg: "^#*我的stoken$",
		describe: "查询绑定stoken"
	},
	bindStoken: {
		reg: "^(.*)stoken=(.*)$",
		describe: "绑定stoken"
	},
	bindLogin_ticket: {
		reg: "^(.*)login_ticket=(.*)$",
		describe: "绑定ck自动获取sk"
	},
	delStoken: {
		reg: "^#*删除(我的)*(stoken|sk)$",
		describe: "删除stoken数据"
	},
	cookiesDocHelp: {
		reg: "^#*(米游社|cookies|stoken|Stoken)(帮助|教程|绑定)$",
		describe: "查看Cookie与Stoken绑定帮助"
	},
	updCookie: {
		reg: "^#*(刷新|更新|获取)(ck|cookie)$",
		describe: "刷新cookie"
	}
}
const _path = process.cwd();
const YamlDataUrl = `${_path}/plugins/xiaoyao-cvs-plugin/data/yaml`;
export async function userInfo(e, {
	render
}) {
	let user = new User(e);
	e.reply("正在获取已绑定账号信息请稍等...")
	let sumData = await user.getCkData()
	let week = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
	let day = moment(new Date()).format("yyyy年MM月DD日 HH:mm") + " " + week[new Date().getDay()];
	if (Object.keys(sumData).length == 0) {
		e.reply("未获取到已绑定的游戏账号信息~")
		return true;
	}
	let ck = "";
	if (e.cookie) {
		ck = await utils.getCookieMap(e.cookie);
		ck = ck?.get("ltuid_v2") || ck?.get("account_id_v2") || ck?.get("ltuid") || ck?.get("account_id")
	}
	return await Common.render(`user/userInfo`, {
		uid: e.user_id,
		ltuid: ck || e.user_id,
		save_id: e.user_id,
		day,
		sumData
	}, {
		e,
		render,
		scale: 1.2
	})
}
let configData = gsCfg.getfileYaml(`${_path}/plugins/xiaoyao-cvs-plugin/config/`, "config");
export async function gcPaylog(e) {
	let user = new User(e);
	await user.cookie(e)
	let redis_Data = await redis.get(`xiaoyao:gcPaylog:${e.user_id}`);
	if (redis_Data) {
		let time = redis_Data * 1 - Math.floor(Date.now() / 1000);
		e.reply(`请求过快,请${time}秒后重试...`);
		return true;
	}
	let isGet = /导出|获取/.test(e.msg)
	if (!e.isPrivate && isGet) {
		e.reply("请私聊发送")
		return true;
	}
	let authkey = await getAuthKey(e, user, { auth_appid: 'csc', game_biz: 'hk4e_cn' })
	if (!authkey) {
		return true;
	}
	let url = `https://webstatic.mihoyo.com/event/user-game-search/hk4e/index.html?selfquery_type=3&lang=zh-cn&sign_type=2&auth_appid=csc&game_biz=hk4e_cn&authkey_ver=1&authkey=${encodeURIComponent(authkey)}&app_client=bbs&type=3&size=6&region=${e.region}&end_id=`
	e.msg = url
	let sendMsg = [];
	e.reply("充值记录获取中请稍等...")
	e._reply = e.reply;
	e.reply = (msg) => {
		sendMsg.push(msg)
	}
	if (isGet) {
		sendMsg = [...sendMsg, ...[1, `uid:${e.uid}`, e.msg]]
	} else {
		let time = (configData.gclogEx || 5) * 60
		redis.set(`xiaoyao:gcPaylog:${e.user_id}`, Math.floor(Date.now() / 1000) + time, { //数据写入缓存避免重复请求
			EX: time
		});
		let { payLog } = (await import(`file://${_path}/plugins/genshin/apps/payLog.js`))
		let pl = new payLog()
		e.isGroup = false
		pl.e = e
		await pl.getAuthKey(e)
		e._reply(sendMsg[1])
		return true
	}
	await utils.replyMake(e, sendMsg, 1)
	return true;
}
export async function srPaylog(e) {
	let user = new User(e);

	let srData = await resolveSrPayRole(e, user);
	if (!srData) {
		e.reply("未找到已绑定的星穹铁道账号，请确认已绑定stoken且该米游社账号下存在星铁角色");
		return true;
	}

	await user.cookie(e);
	e.uid = String(srData.uid);
	e.region = srData.region || getSrServer(srData.uid);

	let redis_Data = await redis.get(`xiaoyao:srPaylog:${e.user_id}`);
	if (redis_Data) {
		let time = redis_Data * 1 - Math.floor(Date.now() / 1000);
		e.reply(`请求过快,请${time}秒后重试...`);
		return true;
	}

	let isGet = /导出|获取/.test(e.msg);
	if (!e.isPrivate && isGet) {
		e.reply("请私聊发送");
		return true;
	}

	let authkey = await getSrPayAuthKey(e, user, srData);
	if (!authkey) {
		return true;
	}

	let url = `https://webstatic.mihoyo.com/hkrpg/event/self-help-query/index.html?selfquery_type=3&lang=zh-cn&sign_type=2&auth_appid=csc&game_biz=hkrpg_cn&authkey_ver=1&authkey=${encodeURIComponent(authkey)}&app_client=bbs&type=3&size=6&region=${e.region}&end_id=`;
	e.msg = url;

	let sendMsg = [];
	e.reply("星铁充值记录获取中请稍等...");
	e._reply = e.reply;
	e.reply = (msg) => {
		sendMsg.push(msg);
	};

	if (isGet) {
		sendMsg = [...sendMsg, ...[1, `uid:${e.uid}`, e.msg]];
	} else {
		let time = (configData.gclogEx || 5) * 60;
		redis.set(`xiaoyao:srPaylog:${e.user_id}`, Math.floor(Date.now() / 1000) + time, {
			EX: time
		});

		let { srPayLog } = (await import(`file://${_path}/plugins/genshin/apps/srPayLog.js`))
		let pl = new srPayLog()
		e.isGroup = false
		pl.e = e
		await pl.getAuthKey()
		if (sendMsg[1]) e._reply(sendMsg[1])
		return true
	}

	await utils.replyMake(e, sendMsg, 1);
	return true;
}

async function resolveSrPayRole(e, user) {
	let stoken = await gsCfg.getUserStoken(e.user_id);
	let entries = Object.entries(stoken || {}).map(([key, value]) => ({
		...(value || {}),
		_tokenKey: key
	})).filter(item => item?.stoken && item?.stuid);

	if (entries.length === 0) return false;

	let srData = entries.find(item => String(item?.region || '').startsWith('prod_'));
	if (srData) {
		return {
			...srData,
			uid: String(srData.uid || srData._tokenKey),
			_tokenUid: String(srData.uid || srData._tokenKey)
		};
	}

	let tokenData = entries[0];
	let tokenUid = String(tokenData.uid || tokenData._tokenKey || '');

	let srUid = e?.user?._games?.sr?.uid || await redis.get(`Yz:starrail:mys:qq-uid:${e.user_id}`);
	if (srUid) {
		let sameUid = entries.find(item => String(item.uid || item._tokenKey) === String(srUid));
		let source = sameUid || tokenData;
		return {
			...source,
			uid: String(srUid),
			region: getSrServer(srUid),
			_tokenUid: String(source.uid || source._tokenKey || tokenUid)
		};
	}

	let oldUid = e.uid;
	let oldRegion = e.region;
	let oldCookie = e.cookie;
	let oldCookies = e.cookies;
	try {
		e.uid = tokenUid;
		e.region = getServer(tokenUid);

		let cookies = `uid=${tokenData.stuid}&stoken=${tokenData.stoken}`;
		if (tokenData?.mid) cookies += `&mid=${tokenData.mid}`;
		let ckData = { cookies, isOs: String(tokenUid)[0] > '5' };
		if (ckData.isOs) ckData.method = 'post';

		let ckRes = await user.getData("bbsGetCookie", ckData, false);
		if (!ckRes?.data?.cookie_token) return false;

		e.cookie = utils.buildV2Cookie({ ltuid: tokenData.stuid, ltoken: tokenData.ltoken || '', cookieToken: ckRes.data.cookie_token, mid: tokenData.mid });

		let forum = user.getDataList?.("崩坏星穹铁道")?.[0];
		if (!forum) return false;

		let roleRes = await user.getData("userGameInfo", forum, false);
		let roles = roleRes?.data?.list || [];
		if (roles.length === 0) return false;

		let knownUids = new Set(entries.map(item => String(item.uid || item._tokenKey || '')));
		let role = roles.find(item => knownUids.has(String(item?.game_uid || ''))) || roles[0];
		if (!role?.game_uid) return false;

		return {
			...tokenData,
			uid: String(role.game_uid),
			region: role.region || getSrServer(role.game_uid),
			region_name: role.region_name,
			_tokenUid: tokenUid
		};
	} catch (err) {
		Bot.logger?.debug?.(`[星铁充值] 读取星铁角色失败：${err?.message || err}`);
		return false;
	} finally {
		e.uid = oldUid;
		e.region = oldRegion;
		e.cookie = oldCookie;
		e.cookies = oldCookies;
	}
}

function getSrServer(uid) {
	switch (String(uid).slice(0, -8)) {
		case '1':
		case '2':
			return 'prod_gf_cn';
		case '5':
			return 'prod_qd_cn';
		case '6':
			return 'prod_official_usa';
		case '7':
			return 'prod_official_euro';
		case '8':
		case '18':
			return 'prod_official_asia';
		case '9':
			return 'prod_official_cht';
	}
	return 'prod_gf_cn';
}

async function getSrPayAuthKey(e, user, srData = {}) {
	let targetUid = String(srData.uid || e.uid);
	let targetRegion = srData.region || e.region || getSrServer(targetUid);
	let tokenUid = String(srData._tokenUid || targetUid);

	let oldUid = e.uid;
	let oldRegion = e.region;
	let oldCookies = e.cookies;
	let authkeyrow;
	try {
		e.uid = tokenUid;
		e.region = getServer(tokenUid);
		authkeyrow = await user.getData("authKey", {
			auth_appid: "csc",
			game_biz: "hkrpg_cn",
			game_uid: targetUid,
			region: targetRegion
		}, false);
	} finally {
		e.uid = oldUid;
		e.region = oldRegion;
		e.cookies = oldCookies;
	}

	if (!authkeyrow?.data) {
		e.reply(`uid:${targetUid},星铁authkey获取失败：` + (authkeyrow?.message?.includes("登录失效") ? "请重新绑定stoken" : (authkeyrow?.message || "未知错误")));
		return false;
	}

	return authkeyrow.data["authkey"];
}

export async function gclog(e) {
	let user = new User(e);
	await user.cookie(e)
	let redis_Data = await redis.get(`xiaoyao:gclog:${e.user_id}`);
	if (redis_Data) {
		let time = redis_Data * 1 - Math.floor(Date.now() / 1000);
		e.reply(`请求过快,请${time}秒后重试...`);
		return true;
	}
	let isGet = /导出|获取/.test(e.msg)
	if (!e.isPrivate && isGet) {
		e.reply("请私聊发送")
		return true;
	}
	let authkey = await getAuthKey(e, user)
	if (!authkey) {
		return true;
	}
	let url = `https://public-operation-hk4e.mihoyo.com/gacha_info/api/getGachaLog?authkey_ver=1&sign_type=2&auth_appid=webview_gacha&init_type=301&gacha_id=fecafa7b6560db5f3182222395d88aaa6aaac1bc&timestamp=${Math.floor(Date.now() / 1000)}&lang=zh-cn&device_type=mobile&plat_type=ios&region=${e.region}&authkey=${encodeURIComponent(authkey)}&game_biz=hk4e_cn&gacha_type=301&page=1&size=5&end_id=0`
	e.msg = url
	let sendMsg = [];
	e.reply("抽卡记录获取中请稍等...")
	e._reply = e.reply;
	e.reply = (msg) => {
		sendMsg.push(msg)
	}
	if (isGet) {
		sendMsg = [...sendMsg, ...[1, `uid:${e.uid}`, e.msg]]
	} else {
		const gclog = (await import(`file://${_path}/plugins/genshin/model/gachaLog.js`)).default
		await (new gclog(e)).logUrl()
	}
	await utils.replyMake(e, sendMsg, 1)
	let time = (configData.gclogEx || 5) * 60
	redis.set(`xiaoyao:gclog:${e.user_id}`, Math.floor(Date.now() / 1000) + time, { //数据写入缓存避免重复请求
		EX: time
	});
	return true;
}
async function getAuthKey(e, user,data={
	auth_appid:'webview_gacha'
}) {
	if (!e.uid) {
		e.uid = e?.runtime?.user?._regUid
	}
	e.region = getServer(e.uid)
	let authkeyrow = await user.getData("authKey", data);
	if (!authkeyrow?.data) {
		e.reply(`uid:${e.uid},authkey获取失败：` + (authkeyrow.message.includes("登录失效") ? "请重新绑定stoken" : authkeyrow.message))
		return false;
	}
	return authkeyrow.data["authkey"];
}
export async function mytoken(e) {
	if (!e.isPrivate) {
		e.reply("请私聊发送")
		return true;
	}
	let user = new User(e);
	await user.getCookie(e)
	let ck = await user.getStoken(e.user_id)
	let sendMsg = `stuid=${ck.stuid};stoken=${ck.stoken};ltoken=${ck.ltoken};`;
	if (ck?.mid) sendMsg += `mid=${ck?.mid};`
	if (sendMsg.includes("undefined")) {
		e.reply("您暂未绑定stoken");
		return true;
	}
	e.reply(sendMsg)
	return true;
}

export async function bindLogin_ticket(e) {
	if (!e.isPrivate) {
		e.reply("请私聊发送")
		return true;
	}
	let user = new User(e);
	let ckMap = await utils.getCookieMap(e.original_msg.replace(/'|"/g, ""))
	let stuid = ckMap?.get("login_uid") || ckMap?.get("ltuid_v2") || ckMap?.get("account_id_v2") || ckMap?.get("ltuid") || ckMap?.get("account_id");
	if (ckMap && Cfg.get("ck.sk")) {
		let res = await user.getData("bbsStoken", {
			loginUid: stuid,
			loginTicket: ckMap.get("login_ticket"),
		})
		if (res?.retcode === 0) {
			e.stuid = stuid;
			await user.seachUid(res)
		}
	}
	return false;
}

export async function bindStoken(e, uid = '', hideUidOutput = false, existingCookieToken = '') {
	if (!e.isPrivate) {
		e.reply("请私聊发送")
		return true;
	}
	let msg = e.msg;
	let user = new User(e);
	await user.cookie(e)
	e.uid = uid || e.uid
	e.region = getServer(e.uid)
	e.cks = msg.replace(/;/g, '&').replace(/stuid/, "uid")
	e.sk = await utils.getCookieMap(msg)
	let isOs = String(e.uid || '').charAt(0) > '5';
	// QR 登录阶段已成功 exchange type=4 时直接复用结果，避免再次交换造成偶发失败。
	let res = existingCookieToken
		? { retcode: 0, data: { cookie_token: existingCookieToken } }
		: await user.getData("bbsGetCookie", { cookies: e.cks, isOs }, false)
	if (!res?.data) {
		e.uid = "64"
		e.region = getServer(e.uid)
		res = await user.getData("bbsGetCookie", { cookies: e.cks, isOs: true, method: 'post' }, false)
		if (!res?.data) {
			await e.reply(`绑定Stoken失败，异常：${res?.message}\n请发送【stoken帮助】查看配置教程重新配置~`);
			return false;
		} else {
				return await user.seachUid(res, hideUidOutput);
		}
	}
	return await user.seachUid(res, hideUidOutput);
}
export async function cookiesDocHelp(e) {
	let user = new User(e);
	e.reply(`【${e.msg.replace(/帮助|教程|绑定/g, "")}帮助】${await user.docHelp(e.msg)}`);
	return true;
}

export async function delStoken(e) {
	let user = new User(e);
	e.msg = e.msg.replace(/#|删除|我的/g, "");
	await user.delSytk(YamlDataUrl, e)
	return true;
}
export async function updCookie(e) {
	let stoken = await gsCfg.getUserStoken(e.user_id);
	if (Object.keys(stoken || {}).length === 0) {
		e.reply("请先绑定stoken\n发送【stoken帮助】查看配置教程")
		return true;
	}
	let isGet = e.msg.includes("获取")
	if (!e.isPrivate && isGet) {
		e.reply("请私聊发送")
		return true;
	}
	let user = new User(e);
	let sendMsg = [];
	e._reply = e.reply;
	e.reply = (msg) => { sendMsg.push(msg) };

	// 小遥 YAML 以游戏 UID 为键，同一个米游社账号可能有多个游戏 UID。
	// 刷新时按 stuid 去重，避免同一账号重复 exchange、重复绑定 CK。
	const accountGroups = new Map();
	for (const [key, record] of Object.entries(stoken || {})) {
		if (!record?.stuid || !record?.stoken) continue;
		const accountKey = String(record.stuid);
		if (!accountGroups.has(accountKey)) accountGroups.set(accountKey, { record, keys: [] });
		accountGroups.get(accountKey).keys.push(key);
	}
	if (accountGroups.size === 0) {
		e.reply("Stoken 数据不完整，请重新扫码绑定")
		await utils.replyMake(e, sendMsg, 0)
		return true;
	}

	for (const [accountId, group] of accountGroups) {
		const record = group.record;
		const roleUid = String(record.uid || '');
		e.uid = roleUid || '1';
		e.region = roleUid ? getServer(roleUid) : 'cn_gf01';
		// 刷新时优先复用绑定 CK 时持久化的设备身份，保持扫码与后续请求一致。
		if (!e.deviceId) {
			try {
				const { default: MysUser } = await import(`file://${_path}/plugins/genshin/model/mys/MysUser.js`);
				const mysUser = await MysUser.create(accountId);
				if (mysUser?.device) e.deviceId = mysUser.device;
			} catch (error) { Bot.logger.debug(`[刷新CK] 读取设备 ID 失败：${error.message}`); }
		}
		if (!e.deviceFp) {
			try {
				e.deviceFp = await redis.get(`genshin:device_fp:${accountId}:fp`) || await redis.get(`ZZZ:DEVICE_FP:${accountId}:FP`) || '38d805c20d53d';
			} catch { e.deviceFp = '38d805c20d53d'; }
		}
		const mid = String(record.mid || '').trim();
		if (!mid) {
			e.reply(`账号:${accountId} 缺少 MID，无法生成完整 v2 CK。请重新扫码绑定以补齐 MID；原有 SK 已保留。`);
			continue;
		}
		let cookies = `uid=${record.stuid}&stoken=${record.stoken}&mid=${mid}`;
		const data = { cookies, isOs: false };
		// 每个 stuid 只执行一次 type=2 / type=4，避免同账号多游戏角色重复交换。
		const [ltokenRes, cookieRes] = await Promise.all([
			user.getData("getLtoken", { cookies }, false),
			user.getData("bbsGetCookie", data, false)
		]);
		const ltoken = ltokenRes?.data?.ltoken || ltokenRes?.data?.token?.token;
		const cookieToken = cookieRes?.data?.cookie_token || cookieRes?.data?.token?.token;
		if (!ltoken || !cookieToken) {
			e.reply(`账号:${accountId}，Token 交换失败：${ltokenRes?.message || cookieRes?.message || 'Ltoken/Cookie Token 返回不完整'}`);
			continue;
		}

		const updates = {};
		for (const key of group.keys) {
			stoken[key].ltoken = ltoken;
			updates[key] = stoken[key];
		}
		await gsCfg.saveBingStoken(e.user_id, updates);
		const newCookie = utils.buildV2Cookie({ ltuid: record.stuid, ltoken, cookieToken, mid });
		if (isGet) {
			sendMsg.push(`账号:${accountId}`, newCookie);
		} else {
			const userck = (await import(`file://${_path}/plugins/genshin/model/user.js`)).default;
			e.ck = newCookie;
			e.msg = newCookie;
			e.raw_message = newCookie;
			await (new userck(e)).bing();
		}
	}
	await utils.replyMake(e, sendMsg, 0);
	return true;
}

function getServer(uid) {
	switch (String(uid)[0]) {
		case '1':
		case '2':
			return 'cn_gf01'
		case '5':
			return 'cn_qd01'
		case '6':
			return 'os_usa'
		case '7':
			return 'os_euro'
		case '8':
			return 'os_asia'
		case '9':
			return 'os_cht'
	}
	return 'cn_gf01'
}