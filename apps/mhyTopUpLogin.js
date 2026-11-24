import mys from "../model/mhyTopUpLogin.js"
import Common from "../components/Common.js";
import { bindStoken } from './user.js'
import utils from '../model/mys/utils.js';
import {
	Cfg,
} from "../components/index.js";
export const rule = {
	qrCodeLogin: {
		reg: `^(?:[#*%])?(?:原神|星铁|绝区零)?(扫码|二维码|辅助)(登录|绑定|登陆)$`,
		describe: "扫码登录"
	},
	UserPassMsg: {
		reg: `^#(账号|密码)(密码)?(登录|绑定|登陆)$`,
		describe: "账号密码登录"
	},
	UserPassLogin: {
		reg: `^账号(.*)密码(.*)$`,
		describe: "账号密码登录"
	}
}


export async function qrCodeLogin(e, { render }) {
	let power = Cfg.get("mhy.qrcode")
	if (power === 3) {
		return false;
	} else {
		if (power == 2 && !e.isPrivate) {
			return false;
		}
		if (power == 1 && !e.isGroup) {
			return false;
		}
	}
	let Mys = new mys(e)
	let res = await Mys.qrCodeLogin()
	if (!res?.data) return false;
	e._reply = e.reply
	let sendMsg = [segment.at(e.user_id), '\n']
	e.reply = (msg) => {
		sendMsg.push(msg)
	}
	await Common.render(`qrCode/index`, {
		url: res.data.url
	}, {
		e,
		render,
		scale: 1.2, retMsgId: true
	})
	let r = await e._reply(sendMsg)
	let qrRecalled = false
	let qrRecallPromise = null
	const recallQrMessage = async () => {
		if (qrRecalled) return true
		if (!r?.message_id) return false
		// 合并定时器、Scanned 和 Confirmed 可能同时触发的撤回请求。
		if (qrRecallPromise) return qrRecallPromise
		qrRecallPromise = (async () => {
			try {
				if (e?.group?.recallMsg) {
					await e.group.recallMsg(r.message_id)
				} else if (e?.friend?.recallMsg) {
					await e.friend.recallMsg(r.message_id)
				} else {
					return false
				}
				qrRecalled = true
				return true
			} catch (err) {
				Bot.logger.debug(`[扫码登录] 二维码消息撤回失败: ${err}`)
				return false
			}
		})()
		try {
			return await qrRecallPromise
		} finally {
			qrRecallPromise = null
		}
	}
	const qrRecallTimer = setTimeout(() => recallQrMessage(), 45 * 1000) // 最迟45秒自动撤回
	e.reply = e._reply
	res = await Mys.GetQrCode(res.data.ticket, async () => {
		const recalled = await recallQrMessage()
		if (recalled) clearTimeout(qrRecallTimer)
		return recalled
	})
	if (!res) return true;
	await bindSkCK(e, res)
	return true;
}


export async function UserPassMsg(e) {
	if (!e.isPrivate) {
		return false;
	}
	let Mys = new mys(e)
	await Mys.UserPassMsg()
	return true;
}


export async function UserPassLogin(e) {
	if (!e.isPrivate) {
		return false;
	}
	let Mys = new mys(e)
	let res = await Mys.UserPassLogin();
	if (res) await bindSkCK(e, res)
	return res;
}

export async function bindSkCK(e, res) {
	e.deviceId = res?.deviceId || e.deviceId
	e.deviceFp = res?.deviceFp || e.deviceFp
	// 将扫码阶段已经成功交换的 Ltoken 一并交给 SK 绑定流程，避免再次请求失败后丢失。
	const skText = [res?.stoken, res?.ltoken ? `ltoken=${res.ltoken}` : ''].filter(Boolean).join(';')
	e.msg = skText, e.raw_message = skText
	e.isPrivate = true
	let skBound = false
	try {
		skBound = await bindStoken(e, '1', true, res?.cookieToken || '')
	} catch (error) {
		Bot.logger.error(`[扫码登录][SK绑定] ${error.stack || error.message}`)
	}
	if (!skBound) await e.reply('Cookie 已绑定，但 Stoken 角色查询或保存失败。请查看 [SK绑定]/[SK角色查询] 日志；已获取的 Stoken 不应丢弃，可稍后重试。')
	e.ck = res?.cookie, e.msg = res.cookie, e.raw_message = res.cookie;
	const userck = (await import(`file://${process.cwd()}/plugins/genshin/model/user.js`)).default
	await (new userck(e)).bing()
	// 将扫码阶段的设备 ID 写入 Genshin MysUsers，供后续重新登录复用。
	try {
		const { default: MysUser } = await import(`file://${process.cwd()}/plugins/genshin/model/mys/MysUser.js`)
		const stuid = String(res?.stoken || '').match(/(?:stuid|uid)=(\d+)/)?.[1]
		if (stuid && e.deviceId) {
			const mysUser = await MysUser.create(stuid)
			if (mysUser) { mysUser.setCkData({ device: e.deviceId }); await mysUser.save() }
			// CK 已经可用后，复用参考插件的 FP 获取逻辑，并缓存账号级 FP。
			try {
				const { default: getDeviceFp } = await import(`file://${process.cwd()}/plugins/genshin/model/getDeviceFp.js`)
				const { deviceFp } = await getDeviceFp.Fp(stuid, e.ck, 'bbs')
				if (deviceFp) {
					const device = await utils.redisGet(e.user_id, 'qrDevice') || {}
					device.deviceId = e.deviceId
					device.deviceFp = deviceFp
					await utils.redisSet(e.user_id, 'qrDevice', device, 60 * 60 * 24 * 30)
				}
			} catch (fpError) { Bot.logger.debug(`[扫码设备] FP 更新失败：${fpError.message}`) }
		}
	} catch (error) {
		Bot.logger.warn(`[扫码设备] MysUsers.device 写入失败：${error.message}`)
	}
}
