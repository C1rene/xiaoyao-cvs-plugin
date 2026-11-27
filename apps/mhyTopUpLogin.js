import mys from "../model/mhyTopUpLogin.js"
import Common from "../components/Common.js";
import { bindStoken } from './user.js'
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
	e.deviceProfile = res?.deviceProfile || e.deviceProfile
	e.deviceSessionId = res?.deviceSessionId || e.deviceSessionId
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
	const ckBound = await (new userck(e)).bing()
	// 登录成功后由 Genshin 将临时设备档案整体归档并覆盖目标 ltuid 的旧档案。
	let stuid = String(res?.stuid || res?.stoken || '').match(/(?:stuid|uid)=(\d+)/)?.[1] || String(res?.stuid || '')
	try {
		if (ckBound && stuid && e.deviceSessionId) {
			const { default: DeviceManager } = await import(`file://${process.cwd()}/plugins/genshin/model/device/DeviceManager.js`)
			await DeviceManager.completeLoginSession(e.deviceSessionId, stuid, e.ck, {
				game: 'bbs', uid: stuid,
				server: e.deviceServer || 'cn_gf01',
				biz: e.deviceBiz || 'hk4e_cn',
				isOs: Boolean(e.deviceIsOs)
			})
			e.deviceProfileLtuid = stuid
			e.deviceSessionId = ''
			Bot.logger.mark(`[扫码设备] 临时设备档案已归档到 ltuid:${stuid}`)
		}
	} catch (error) {
		Bot.logger.error(`[扫码设备] 临时设备档案归档失败，尝试由 Genshin 为账号初始化正式档案：${error.stack || error.message}`)
		try {
			if (stuid && e.ck) {
				const { default: DeviceManager } = await import(`file://${process.cwd()}/plugins/genshin/model/device/DeviceManager.js`)
				await DeviceManager.getForAccount(stuid, e.ck, {
					game: 'bbs', uid: stuid,
					server: e.deviceServer || 'cn_gf01',
					biz: e.deviceBiz || 'hk4e_cn',
					isOs: Boolean(e.deviceIsOs)
				})
				e.deviceSessionId = ''
			}
		} catch (fallbackError) {
			Bot.logger.error(`[扫码设备] 正式设备档案初始化也失败：${fallbackError.stack || fallbackError.message}`)
		}
	}
}
