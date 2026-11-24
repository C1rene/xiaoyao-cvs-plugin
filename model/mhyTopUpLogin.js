import User from "./user.js";
import utils from './mys/utils.js';
import gsCfg from './gsCfg.js';
export default class mysTopLogin {
    constructor(e) {
        this.e = e;
        this.init();
        //消息提示以及风险警告
        this.sendMsgUserPassLogin = `免责声明:您将通过密码完成获取米游社sk以及ck。\n本Bot将不会保存您的账号和密码。\n我方仅提供米游社查询及相关游戏内容服务,若您的账号封禁、被盗等处罚与我方无关。\n害怕风险请勿发送账号密码~`
    }
    async init() {
        this.user = new User(this.e)
    }
    //
    async qrCodeLogin() {
        let RedisData = await utils.redisGet(this.e.user_id, "GetQrCode")
        if (RedisData) {
            this.e.reply([segment.at(this.e.user_id), `前置二维码未扫描，请勿重复触发指令`])
            return false;
        }
        // 同一用户的扫码会话复用配对设备身份；不再让 API 模块共享全局设备 ID。
        let device = await utils.redisGet(this.e.user_id, 'qrDevice')
        if (!device?.deviceId) {
            // Redis 缺失时，优先从该 QQ 已绑定 SK 对应的 MysUser.device 恢复设备 ID。
            try {
                const sks = await gsCfg.getUserStoken(this.e.user_id)
                const sk = Object.values(sks || {}).find(v => v?.stuid)
                if (sk?.stuid) {
                    const { default: MysUser } = await import(`file://${process.cwd()}/plugins/genshin/model/mys/MysUser.js`)
                    const mysUser = await MysUser.create(sk.stuid)
                    if (mysUser?.device) device = { deviceId: mysUser.device }
                }
            } catch (error) {
                Bot.logger.debug(`[扫码设备] 读取已有设备失败：${error.message}`)
            }
        }
        if (!device?.deviceId) device = { deviceId: utils.randomString(32).toUpperCase() }
        if (!device.deviceFp) {
            // 尝试复用 Genshin 已有的账号级 FP；首次登录时使用参考插件采用的默认 FP，
            // 成功绑定 CK 后再调用其设备指纹生成逻辑更新。
            try {
                const sks = await gsCfg.getUserStoken(this.e.user_id)
                const sk = Object.values(sks || {}).find(v => v?.stuid)
                if (sk?.stuid) device.deviceFp = await redis.get(`genshin:device_fp:${sk.stuid}:fp`) || await redis.get(`ZZZ:DEVICE_FP:${sk.stuid}:FP`)
            } catch {}
            device.deviceFp = device.deviceFp || '38d805c20d53d'
        }
        await utils.redisSet(this.e.user_id, 'qrDevice', device, 60 * 60 * 24 * 30)
        this.device = device.deviceId
        this.e.deviceId = device.deviceId
        this.e.deviceFp = device.deviceFp
        let res = await this.user.getData("qrCodeLogin", {
            device: this.device
        },false)
        if (!res.data) {
            return false;
        }
        res.data["ticket"] = res.data["ticket"] || res?.data?.url.split("ticket=")[1]
        return res
    }
    async GetQrCode(ticket, onScanned) {
        await utils.redisSet(this.e.user_id, "GetQrCode", { GetQrCode: 1 }, 60 * 5) //设置5分钟缓存避免重复触发
        let res;
        let RedisData = await utils.redisGet(this.e.user_id, "GetQrCode")
        let hasScanned = false
        let scannedAt = null
        let confirmed = false
        // Scanned 分支可能被 5 秒轮询间隔跳过；Confirmed 时仍需确保撤回回调执行。
        // 回调返回 false 或抛错时不标记完成，允许后续 Confirmed 分支再次尝试。
        let qrRecallNotified = false
        const notifyQrRecall = async () => {
            if (qrRecallNotified || typeof onScanned !== "function") return
            try {
                const result = await onScanned()
                // 兼容原有无返回值回调；显式 false 表示撤回失败，需要保留重试机会。
                if (result !== false) qrRecallNotified = true
            } catch (error) {
                Bot.logger.warn(`[扫码登录] 二维码撤回回调执行失败: ${error?.message || error}`)
            }
        }
        for (let n = 1; n < 60; n++) {
            await utils.sleepAsync(5000)
            res = await this.user.getData("qrCodeQuery", {
                device: this.device, ticket
            },false)
            if (res && Number(res.retcode) !== 0) {
                Bot.logger.warn(`[扫码登录] QR 状态查询失败 retcode=${res.retcode} message=${res.message || 'unknown'}`)
                break
            }
            if (res?.data?.status == "Scanned") {
                if (!hasScanned) scannedAt = n
                hasScanned = true
                if (RedisData.GetQrCode == 1) {
                    Bot.logger.mark(JSON.stringify({ api: 'qrCodeQuery', status: res?.data?.status, retcode: res?.retcode, tokenCount: res?.data?.tokens?.length || 0, hasUserInfo: Boolean(res?.data?.user_info) }))
                    await notifyQrRecall()
                    await this.e.reply("二维码已扫描，请确认登录", true)
                    RedisData.GetQrCode++;
                }
            }
            if (res?.data?.status == "Confirmed") {
                // 扫码与确认可能发生在两次轮询之间，直接从 Pending 到 Confirmed。
                // Confirmed 表示二维码已被使用，因此无论是否观察到 Scanned，都补做撤回。
                await notifyQrRecall()
                confirmed = true
                Bot.logger.mark(JSON.stringify({ api: 'qrCodeQuery', status: res?.data?.status, retcode: res?.retcode, tokenCount: res?.data?.tokens?.length || 0, hasUserInfo: Boolean(res?.data?.user_info) }))
                break
            }
            // 60秒内仍未扫码则直接结束验证
            if (n >= 12 && !hasScanned) {
                break
            }
            // 已扫码后最多等待30秒（每5秒轮询一次）
            if (hasScanned && n - scannedAt >= 6) {
                break
            }
        }
        await utils.redisDel(this.e.user_id, 'GetQrCode')
        if (!confirmed) {
            await this.e.reply("验证超时", true)
            return false
        }
        if (!res?.data?.user_info || !Array.isArray(res?.data?.tokens) || res.data.tokens.length === 0) {
            await this.e.reply("stoken获取不完整请重新扫码", true)
            return false
        }
        const uid = res.data.user_info.aid || res.data.user_info.uid || res.data.user_info.account_id
        const mid = res.data.user_info.mid
        let token = (res.data.tokens.find(i => i.name === "stoken" || i.name === "stoken_v2") || res.data.tokens[0])?.token
         if (!(uid && token && mid)) {
            await this.e.reply("stoken获取不完整请重新扫码", true);
            return false
        }
        // 采用 Genshin 的 Passport exchange 流程：type=2 获取 Ltoken，type=4 获取 Cookie Token。
        // 两次请求均使用当前扫码会话的同一设备身份。
        const [LtokenData, UserData] = await Promise.all([
            this.user.getData('exchange', { token, type: 2, mid }, false),
            this.user.getData('exchange', { token, type: 4, mid }, false)
        ])
        const ltoken = LtokenData?.data?.token?.token || LtokenData?.data?.ltoken
        const cookieToken = UserData?.data?.token?.token || UserData?.data?.cookie_token
        if (!cookieToken) {
            await this.e.reply(`获取Cookie Token失败：${UserData?.message || UserData?.retcode || '接口未返回有效 Token'}，已保留本次扫码获得的 Stoken，请稍后重试刷新 CK。`, true)
            return false
        }
        if (!ltoken) {
            await this.e.reply(`获取Ltoken失败：${LtokenData?.message || LtokenData?.retcode || '接口未返回有效 Token'}`, true)
            return false
        }

        const stoken = `stoken=${token};stuid=${uid};mid=${mid}`
        return {
            cookie: utils.buildV2Cookie({ ltuid: uid, ltoken, cookieToken, mid }),
            ltoken,
            cookieToken,
            stuid: uid,
            mid,
            deviceId: this.device,
            deviceFp: this.e.deviceFp,
            stoken
        }
    }

    async UserPassMsg() {
        this.e.reply(this.sendMsgUserPassLogin)
        this.e.reply(`请将账号密码用逗号隔开私聊发送以完成绑定\n例：账号xxx@qq.com,密码xxxxx`)
    }
    async UserPassLogin() {
        let msg = this.e.msg.replace(/账号|密码|：|:/g, '').replace(/,|，/, ',').split(',');
        if (msg.length != 2) {
            return false;
        }
        let body = {
            account: msg[0], password: msg[1],
        }
        let res = await this.user.getData("loginByPassword", body, "")
        Bot.logger.mark(`[米哈游登录] retcode=${res?.retcode} message=${res?.message || 'unknown'}`)
        if (res?.retcode == -3101) {
            await this.e.reply("账号密码登录当前无法完成，请改用扫码登录。", true)
            return false
        }
        if (res.retcode == 0) {
            let cookies = `stoken=${res.data.token.token}&mid=${res.data.user_info.mid}`
            let cookie_token = await this.user.getData("bbsGetCookie", { cookies })
            let ltoken = await this.user.getData('getLtoken', { cookies: `${cookies}` }, false)
            Bot.logger.mark(`[米哈游登录] Cookie Token exchange retcode=${cookie_token?.retcode} hasToken=${Boolean(cookie_token?.data?.cookie_token || cookie_token?.data?.token?.token)}`)
            const accountId = res.data.user_info.aid || res.data.user_info.uid || res.data.user_info.account_id
            const mid = res.data.user_info.mid
            const ltokenValue = ltoken?.data?.ltoken || ltoken?.data?.token?.token
            const cookieTokenValue = cookie_token?.data?.cookie_token || cookie_token?.data?.token?.token
            return {
                cookie: utils.buildV2Cookie({ ltuid: accountId, ltoken: ltokenValue, cookieToken: cookieTokenValue, mid }),
                stoken: `${cookies.replace('&', ';')};stuid=${accountId};`
            }
        } else {
            await this.e.reply(`登录失败：${res?.message || '接口返回异常'}（retcode=${res?.retcode ?? 'unknown'}）`, true)
            return false
        }
    }
}
