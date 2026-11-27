import User from "./user.js";
import utils from './mys/utils.js';
export default class mysTopLogin {
    constructor(e) {
        this.e = e;
        this.user = new User(this.e);
        //消息提示以及风险警告
        this.sendMsgUserPassLogin = `免责声明:您将通过密码完成获取米游社sk以及ck。\n本Bot将不会保存您的账号和密码。\n我方仅提供米游社查询及相关游戏内容服务,若您的账号封禁、被盗等处罚与我方无关。\n害怕风险请勿发送账号密码~`
    }
    async ensureLoginDevice() {
        const { default: DeviceManager } = await import(`file://${process.cwd()}/plugins/genshin/model/device/DeviceManager.js`);
        let record = this.e.deviceSessionId
            ? await DeviceManager.getLoginSession(this.e.deviceSessionId)
            : null;
        if (!record) {
            const isOs = Boolean(this.e.isOs || /(?:os_|global|prod_official_(?:usa|eur|asia|cht|tw|hk|kr)|prod_gf_(?:us|usa|eu|eur|jp|sg|asia|cht|tw|hk|kr))/i.test(String(this.e.region || '')));
            const server = isOs ? (this.e.region || 'os_usa') : 'cn_gf01';
            const biz = isOs ? 'hk4e_global' : 'hk4e_cn';
            record = await DeviceManager.createLoginSession('', { game: 'bbs', server, biz, isOs });
            this.e.deviceSessionId = record.sessionId;
            this.e.deviceServer = server;
            this.e.deviceBiz = biz;
            this.e.deviceIsOs = isOs;
        }
        if (!record?.deviceId || !record?.deviceFp || !record?.profile) {
            throw new Error('Genshin 未能创建完整的临时设备档案');
        }
        this.e.deviceServer = record.server || this.e.deviceServer || 'cn_gf01';
        this.e.deviceBiz = record.biz || this.e.deviceBiz || 'hk4e_cn';
        this.e.deviceIsOs = Boolean(record.isOs || this.e.deviceIsOs);
        this.device = record.deviceId;
        this.e.deviceId = record.deviceId;
        this.e.deviceFp = record.deviceFp;
        this.e.deviceProfile = record.profile;
        return record;
    }

    async qrCodeLogin() {
        let RedisData = await utils.redisGet(this.e.user_id, "GetQrCode")
        if (RedisData) {
            this.e.reply([segment.at(this.e.user_id), `前置二维码未扫描，请勿重复触发指令`])
            return false;
        }
        await this.ensureLoginDevice();
        let res = await this.user.getData("qrCodeLogin", {
            device: this.device,
            deviceId: this.e.deviceId,
            deviceFp: this.e.deviceFp,
            deviceProfile: this.e.deviceProfile
        }, false)
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
            deviceProfile: this.e.deviceProfile,
            deviceSessionId: this.e.deviceSessionId,
            stoken
        }
    }

    async UserPassMsg() {
        this.e.reply(this.sendMsgUserPassLogin)
        this.e.reply(`请将账号密码用逗号隔开私聊发送以完成绑定\n例：账号xxx@qq.com,密码xxxxx`)
    }
    async UserPassLogin() {
        await this.ensureLoginDevice();
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
                stoken: `${cookies.replace('&', ';')};stuid=${accountId};`,
                deviceId: this.device,
                deviceFp: this.e.deviceFp,
                deviceProfile: this.e.deviceProfile,
                deviceSessionId: this.e.deviceSessionId
            }
        } else {
            await this.e.reply(`登录失败：${res?.message || '接口返回异常'}（retcode=${res?.retcode ?? 'unknown'}）`, true)
            return false
        }
    }
}
