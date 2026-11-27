import utils from './utils.js';
import md5 from 'md5';
import _ from 'lodash';
import fs from "fs";
import YAML from 'yaml'
import {
	Data
} from "../../components/index.js";
import gsCfg from '../gsCfg.js'
import fetch from "node-fetch"
import mys from "./mysTool.js"
import crypto from "crypto";
const _path = process.cwd();
const yamlDataUrl = `${_path}/plugins/xiaoyao-cvs-plugin/data/yaml`;
let HttpsProxyAgent = ''

export default class miHoYoApi {
	constructor(e) {
		if (e) {
			this.e = e
			this.cookie = e.cookie
		// 设备身份只能来自 Genshin DeviceManager；此处不生成随机 ID、不使用固定 FP。
		this.deviceProfile = e.deviceProfile || null;
		this.deviceId = e.deviceId || e.device_id || this.deviceProfile?.deviceId || '';
		this.deviceFp = e.deviceFp || e.device_fp || this.deviceProfile?.deviceFp || '';
		this.deviceName = this.deviceProfile?.deviceName || e.deviceName || '';

			this.userId = String(e.user_id)
			this.isOs = false;
			if (this.e?.uid) {
				this.isOs = this.e?.uid[0] * 1 > 5
			}
			this.apiMap = {
				apiWeb: mys.web_api,
				saltweb: mys.saltWeb,
				saltSign: mys.salt
			}
			if (this.isOs) {
				this.apiMap = {
					apiWeb: mys.os_web_api,
					saltweb: mys.saltWeb, //os websalt待定中
					saltSign: mys.salt
				}
			}
			let data = this.getStoken(this.e.user_id);
			if (data) {
				this.cookies = `stuid=${data.stuid};stoken=${data.stoken};ltoken=${data.ltoken};`;
				if (data?.mid) {
					this.cookies = `stuid=${data.stuid};stoken=${data.stoken};mid=${data.mid};`;
				}
				this.e.cookies = this.cookies
			}
		}
		Data.createDir("", yamlDataUrl, false);
	}

	getBody(name) {
		for (let item in mys.boards) {
			if (mys.boards[item].name === name) {
				return mys.boards[item]
			}
		}
	}

	static ckRefreshTasks = new Map();

	async ensureDeviceInfo(data = {}) {
		const { default: DeviceManager } = await import(`file://${_path}/plugins/genshin/model/device/DeviceManager.js`);
		const sessionId = this.e?.deviceSessionId;
		const sessionRecord = sessionId ? await DeviceManager.getLoginSession(sessionId) : null;
		if (sessionId && !sessionRecord) throw new Error('Genshin 临时设备登录会话不存在或已过期');
		const ltuid = await DeviceManager.getLtuid(data?.cookies, true) || await DeviceManager.getLtuid(this.cookie) || await DeviceManager.getLtuid(this.e?.cookie) || await DeviceManager.getLtuid(this.e?.cookies) || String(this.e?.stuid || '');
		const candidateCookie = this.cookie || this.e?.cookie || '';
		const candidateCookieLtuid = await DeviceManager.getLtuid(candidateCookie);
		const accountCookie = candidateCookieLtuid === String(ltuid) ? candidateCookie : '';

		// 仅当设备档案确实属于当前 ltuid，或当前请求仍处于同一个临时登录会话时，才复用事件对象中的缓存。
		const profileMatchesSession = sessionId && this.deviceProfile?.profileId === sessionRecord?.profile?.profileId;
		if (this.deviceProfile?.deviceId && this.deviceProfile?.deviceFp && sessionId && profileMatchesSession) {
			this.deviceId = this.deviceProfile.deviceId;
			this.deviceFp = this.deviceProfile.deviceFp;
			this.deviceName = this.deviceProfile.deviceName || this.deviceName;
			this.e.deviceId = this.deviceId;
			this.e.deviceFp = this.deviceFp;
			this.e.deviceProfile = this.deviceProfile;
			return { deviceId: this.deviceId, deviceFp: this.deviceFp, profile: this.deviceProfile };
		}

		let record = null;
		if (sessionId) {
			record = sessionRecord;
		} else if (ltuid && /^\d{4,12}$/.test(ltuid)) {
			const isOs = Boolean(this.isOs || this.e?.isOs || String(this.e?.uid || '')[0] > '5' || /(?:os_|global|prod_official_(?:usa|eur|asia|cht|tw|hk|kr)|prod_gf_(?:us|usa|eu|eur|jp|sg|asia|cht|tw|hk|kr))/i.test(String(this.e?.region || '')));
			record = await DeviceManager.getForAccount(ltuid, accountCookie, {
				game: 'bbs', uid: this.e?.uid || ltuid,
				server: isOs ? 'os_usa' : 'cn_gf01',
				biz: isOs ? 'hk4e_global' : 'hk4e_cn', isOs
			});
		} else {
			const isOs = Boolean(this.e?.isOs || /(?:os_|global|prod_official_(?:usa|eur|asia|cht|tw|hk|kr)|prod_gf_(?:us|usa|eu|eur|jp|sg|asia|cht|tw|hk|kr))/i.test(String(this.e?.region || '')));
			const server = isOs ? (this.e?.region || 'os_usa') : 'cn_gf01';
			const biz = isOs ? 'hk4e_global' : 'hk4e_cn';
			record = await DeviceManager.createLoginSession('', { game: 'bbs', server, biz, isOs });
			this.e.deviceSessionId = record.sessionId;
			this.e.deviceServer = server;
			this.e.deviceBiz = biz;
			this.e.deviceIsOs = isOs;
		}
		if (!record?.deviceId || !record?.deviceFp || !record?.profile) {
			throw new Error('Genshin DeviceManager 未返回完整设备档案');
		}
		this.deviceProfile = record.profile;
		this.deviceId = record.deviceId;
		this.deviceFp = record.deviceFp;
		this.deviceName = record.profile.deviceName || '';
		this.e.deviceId = this.deviceId;
		this.e.deviceFp = this.deviceFp;
		this.e.deviceProfile = this.deviceProfile;
		this.e.deviceProfileLtuid = record.ltuid || record.profile.ltuid || '';
		return record;
	}

	async getData(type, data = {}, refreshed = false) {
		try {
			await this.ensureDeviceInfo(data);
		} catch (error) {
			logger.error(`[Xiaoyao][DeviceManager] ${error.message}`);
			return false;
		}

		let gameBody = this.getBody(data.name);
		let {
			url,
			headers,
			body
		} = this.getUrl(type, gameBody, data)

		if (!url) return false
		if (data.headers) {
			headers = {
				...headers,
				...data.headers
			}
			delete data.headers
		}
		let param = {
			headers,
			agent: await this.getAgent(),
			timeout: 10000
		}

		if (body) {
			param.method = 'post'
			param.body = body
		} else {
			param.method = 'get'
		}
		if(data.method){
			param.method=data.method
		}
		let response = {}
		let start = Date.now()
		try {
			response = await fetch(url, param)
		} catch (error) {
			logger.error(error.toString())
			return false
		}
		if (!response.ok) {
			Bot.logger.error(`[接口][${type}][${this.e.uid}] ${response.status} ${response.statusText}`)
			return false
		}

		let res = await response.text();
		if (res.startsWith('(')) {
			res = JSON.parse((res).replace(/\(|\)/g, ""))
		} else {
			res = JSON.parse(res)
		}
		if (!res) {
			Bot.logger.mark('mys接口没有返回')
			return false
		}
		if (res.retcode !== 0) {
			Bot.logger.debug(`[米游社接口][请求参数] ${url} ${JSON.stringify(param)}`)
			// 小遥自有 API 请求补充 CK 自动刷新；交换接口本身不递归刷新。
			const refreshable = !refreshed && !/exchange|getLtoken|bbsGetCookie|qrCode/i.test(type)
			const loginExpired = [-1, -100, 1001, 10001, 10103].includes(Number(res.retcode)) && /(登录|login|cookie|凭证|失效)/i.test(String(res.message || ''))
			if (refreshable && loginExpired) {
				const newCk = await this.refreshCookieFromStoken()
				if (newCk) {
					this.cookie = newCk
					this.e.cookie = newCk
					return await this.getData(type, data, true)
				}
			}
		}
		// 统一兼容旧调用方：Cookie Token/Ltoken 统一通过 Passport exchange 获取。
		if (type === 'bbsGetCookie' && res?.data?.token?.token && !res.data.cookie_token) {
			res.data.cookie_token = res.data.token.token
		}
		if (type === 'bbsGetCookie' && res?.data?.token?.token) res.data.cookie_token = res.data.token.token
		if (type === 'getLtoken' && res?.data?.token?.token && !res.data.ltoken) {
			res.data.ltoken = res.data.token.token
		}
		res.api = type
		return res
	}
	getUrl(type, board, data) {
		let urlMap = {
			userGameInfo: {
				url: `${this.apiMap.apiWeb}/binding/api/getUserGameRolesByCookie`,
				query: `game_biz=${this.isOs ? board?.osbiz : board?.biz}`,
				types: 'role'
			},
			bbsGetCookie: (() => {
				const p = new URLSearchParams(String(data.cookies || '').replace(/;/g, '&'));
				const token = p.get('stoken') || p.get('stoken_v2');
				const mid = p.get('mid') || p.get('ltmid_v2') || p.get('account_mid_v2');
				return {
					url: `${mys.pass_api}/account/ma-cn-session/app/exchange`,
					body: { src_token: { token, token_type: 1 }, mid, dst_token_type: 4 },
					types: 'exchange'
				};
			})(),
			bbsStoken: {
				url: `${this.apiMap.apiWeb}/auth/api/getMultiTokenByLoginTicket`,
				query: `login_ticket=${data.loginTicket}&token_types=3&uid=${data.loginUid}`,
				types: 'stoken'
			},
			authKey: {
				url: `${this.apiMap.apiWeb}/binding/api/genAuthKey`,
				body: {
					'auth_appid': data.auth_appid ?? 'webview_gacha',
					'game_biz': data.game_biz ?? (this.isOs ? 'hk4e_global' : 'hk4e_cn'),
					'game_uid': Number(data.game_uid ?? this.e.uid),
					'region': data.region ?? this.e.region,
				},
				types: 'authKey'
			},
			getLtoken: (() => {
				const p = new URLSearchParams(String(data.cookies || '').replace(/;/g, '&'));
				const token = p.get('stoken') || p.get('stoken_v2');
				const mid = p.get('mid') || p.get('ltmid_v2') || p.get('account_mid_v2');
				return {
					url: `${mys.pass_api}/account/ma-cn-session/app/exchange`,
					body: { src_token: { token, token_type: 1 }, mid, dst_token_type: 2 },
					types: 'exchange'
				};
			})(),
			exchange: {
				url: `${mys.pass_api}/account/ma-cn-session/app/exchange`,
				body: { src_token: { token: data.token, token_type: 1 }, mid: data.mid, dst_token_type: data.type },
				types: 'exchange'
			},
			loginByPassword: {
				url: `${mys.pass_api}/account/ma-cn-passport/app/loginByPassword`,
				body: {
					account: this.encrypt_data(data.account),
					password: this.encrypt_data(data.password)
				},
				types: 'pass'
			},
			qrCodeLogin: {
				url: `${mys.pass_api}/account/ma-cn-passport/app/createQRLogin`,
				body: {},
				types: 'pass'
			},
			qrCodeQuery: {
				url: `${mys.pass_api}/account/ma-cn-passport/app/queryQRLoginStatus`,
				body: {
					ticket: data.ticket
				},
				types: 'pass'
			},
			getTokenByGameToken: {
				url: `${mys.pass_api}/account/ma-cn-session/app/getTokenByGameToken`,
				body: {
					account_id: data.uid * 1,
					game_token: data.token
				},
				types: 'pass'
			},
			getCookieAccountInfoByGameToken: {
				url: `${mys.web_api}/auth/api/getCookieAccountInfoByGameToken`,
				query: `account_id=${data.uid}&game_token=${data.token}`
			}
		}
		if (!urlMap[type]) return false
		let {
			url,
			query = '',
			body = '',
			types = '',
			sign = ''
		} = urlMap[type]
		if (query) url += `?${query}`
		if (body) body = JSON.stringify(body)
		let headers = this.getHeaders(board, types, sign, body, query)
		const profile = data?.deviceProfile || this.deviceProfile
		if (profile) {
			const osVersion = profile.androidVersion || '13'
			const modelName = profile.deviceModel || 'Android'
			const brand = profile.brand || profile.deviceFingerprint?.split('/')[0] || 'Android'
			const buildId = profile.deviceFingerprint?.split('/')[3] || 'release'
			headers['x-rpc-device_id'] = data?.deviceId || profile.deviceId
			headers['x-rpc-device_fp'] = data?.deviceFp || profile.deviceFp
			headers['x-rpc-device_name'] = profile.deviceName || `${brand} ${modelName}`
			headers['x-rpc-device_model'] = modelName
			headers['x-rpc-sys_version'] = osVersion
			if (headers['User-Agent'] && !/^okhttp\//i.test(headers['User-Agent'])) {
				headers['User-Agent'] = `Mozilla/5.0 (Linux; Android ${osVersion}; ${modelName} Build/${buildId}; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/111.0.5563.116 Mobile Safari/537.36 miHoYoBBS/${mys.APP_VERSION}`
			}
		}
		return {
			url,
			headers,
			body
		}
	}

	getHeaders(board, type = "", sign, body = {}, query = '') {
		let header = {};
		switch (type) {
			case "role":
				header = {
					'accept-language': 'zh-CN,zh;q=0.9,ja-JP;q=0.8,ja;q=0.7,en-US;q=0.6,en;q=0.5',
					'x-rpc-device_id': this.deviceId,
					'x-rpc-device_fp': this.deviceFp,
					'User-Agent': `Mozilla/5.0 (Linux; Android ${this.deviceProfile?.androidVersion || '13'}; ${this.deviceProfile?.deviceModel || 'Android'} Build/${this.deviceProfile?.deviceFingerprint?.split('/')[3] || 'release'}; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/111.0.5563.116 Mobile Safari/537.36 miHoYoBBS/${mys.APP_VERSION}`,
					Referer: board?.url || "https://bbs.mihoyo.com/",
					Host: 'api-takumi.mihoyo.com',
					'x-rpc-channel': 'appstore',
					'x-rpc-app_version': mys.APP_VERSION,
					'x-requested-with': 'com.mihoyo.hyperion',
					'x-rpc-client_type': '5',
					'Content-Type': 'application/json;charset=UTF-8',
					DS: this.getDs(),
					'Cookie': this.cookie
				}
				if(board.key === "genshin"){
          header["x-rpc-signgame"]="hk4e"
        }
				if (this.isOs) {
					let os_Header = {
						app_version: '2.9.0',
						User_Agent: `Mozilla/5.0 (Linux; Android 9.0; SAMSUNG SM-F900U Build/PPR1.180610.011) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/99.0.4844.73 Mobile Safari/537.36 miHoYoBBSOversea/2.9.0`,
						client_type: '2',
						'x-rpc-app_version': '2.9.0',
						Origin: 'https://webstatic-sea.hoyolab.com',
						X_Requested_With: 'com.mihoyo.hoyolab',
						Referer: 'https://webstatic-sea.hoyolab.com',
						'x-rpc-device_id': this.deviceId,
						'x-rpc-device_fp': this.deviceFp,
						DS: this.getDs(),
						'Cookie': this.cookie
					}
					header = os_Header
				}
				break;
			case "authKey":
				header = {
					'x-rpc-app_version': mys.APP_VERSION,
					'User-Agent': 'okhttp/4.8.0',
					'x-rpc-client_type': '5',
					Referer: 'https://app.mihoyo.com',
					Origin: 'https://webstatic.mihoyo.com',
					Cookie: this.cookies,
					DS: this.getDs(this.isOs ? mys.osSalt : mys.saltWeb),
					'x-rpc-sys_version': '12',
					'x-rpc-channel': 'mihoyo',
					'x-rpc-device_id': this.deviceId,
					'x-rpc-device_fp': this.deviceFp,
					'x-rpc-device_name': this.deviceName,
					'x-rpc-device_model': this.deviceProfile?.deviceModel || 'Android',
					Host: 'api-takumi.mihoyo.com'
				}
				if (this.isOs) {
					let os_Header = {
						'x-rpc-app_version': '2.18.1',
						app_version: '2.18.1',
						client_type: '2',
						'x-rpc-client_type': '2',
						Origin: 'https://app.hoyolab.com',
						X_Requested_With: 'com.mihoyo.hoyolab',
						Referer: 'https://app.hoyolab.com',
						Host: 'api-os-takumi.mihoyo.com',
						'x-rpc-channel': 'hoyolab'
					}
					header = Object.assign({}, header, os_Header)
				}
				break;
			case "stoken":
				header = {
					"x-rpc-device_id": this.deviceId,
					"x-rpc-device_fp": this.deviceFp,
					"Content-Type": "application/json;charset=UTF-8",
					"x-rpc-client_type": "",
					"x-rpc-app_version": "",
					"DS": "",
					"User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) miHoYoBBS/%s",
					"Referer": "cors",
					"Accept-Encoding": "gzip, deflate, br",
					"x-rpc-channel": "appstore",
				}
				break;
			case "cookieToken":
				// Mirrors GSUID Core BaseMysApi._HEADER +
				// AccountMysApi.get_cookie_token_by_stoken_cn().
				const tokenParams = new URLSearchParams(query || '');
				const cookieParts = [];
				const accountId = tokenParams.get('uid');
				const stoken = tokenParams.get('stoken');
				const mid = tokenParams.get('mid');
				if (accountId) cookieParts.push(`stuid=${accountId}`);
				if (stoken) cookieParts.push(`stoken=${stoken}`);
				if (mid) cookieParts.push(`mid=${mid}`);
				header = {
					"x-rpc-app_version": "2.102.1",
					"X-Requested-With": "com.mihoyo.hyperion",
					"User-Agent": "Mozilla/5.0 (Linux; Android 13; PHK110 Build/SKQ1.221119.001; wv)AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/126.0.6478.133 Mobile Safari/537.36 miHoYoBBS/2.102.1",
					"x-rpc-client_type": "5",
					"Referer": "https://webstatic.mihoyo.com/",
					"Origin": "https://webstatic.mihoyo.com/",
					"Cookie": cookieParts.join(';')
				}
				break;
			case "exchange":
				header = {
					'x-rpc-device_id': this.deviceId,
					'x-rpc-device_fp': this.deviceFp,
					'x-rpc-device_name': this.deviceName,
					'x-rpc-device_model': this.deviceProfile?.deviceModel || this.deviceName,
					'x-rpc-app_id': 'bll8iq97cem8',
					'x-rpc-app_version': mys.APP_VERSION,
					'x-rpc-client_type': '2',
					'x-rpc-game_biz': 'bbs_cn',
					'x-rpc-sys_version': this.deviceProfile?.androidVersion || '13',
					'Content-Type': 'application/json',
					'DS': this.getDs2('', body, mys.passSalt),
					'x-rpc-sdk_version': '1.3.1.2',
					'User-Agent': 'okhttp/4.8.0',
					'Accept-Encoding': 'gzip, deflate, br'
				}
				break;
			case "pass":
				header = {
					'x-rpc-device_id': this.deviceId,
					'x-rpc-app_id': "bll8iq97cem8",
					'x-rpc-device_name': this.deviceName,
					"x-rpc-device_fp": this.deviceFp,
					"x-rpc-device_model": this.deviceProfile?.deviceModel || this.deviceName,
					'x-rpc-app_version': mys.APP_VERSION,
					'x-rpc-game_biz': 'bbs_cn',
					"x-rpc-sys_version": this.deviceProfile?.androidVersion || '13',
					"Content-Type": "application/json;",
					"x-rpc-client_type": "2",
					"DS": this.getDs2('', body, mys.passSalt),
					"x-rpc-sdk_version": '1.3.1.2',
					"User-Agent": "okhttp/4.8.0",
					"Connection": 'Keep-Alive',
					"Accept-Encoding": "gzip, deflate, br",
					"x-rpc-channel": "appstore",
					Cookie: this.cookies,
				}
				break;
			default:
				header = {}
				break;
		}
		return header;
	}
	async refreshCookieFromStoken() {
		const cookie = String(this.cookie || this.e?.cookie || '')
		const stuid = cookie.match(/(?:ltuid_v2|account_id_v2|ltuid|account_id|stuid)=(\d+)/)?.[1]
		if (!stuid) return false
		if (miHoYoApi.ckRefreshTasks.has(stuid)) return await miHoYoApi.ckRefreshTasks.get(stuid)
		const task = (async () => {
			try {
				const file = `${yamlDataUrl}/${this.userId}.yaml`
				if (!fs.existsSync(file)) return false
				const records = YAML.parse(fs.readFileSync(file, 'utf8')) || {}
				const matches = Object.entries(records).filter(([, v]) => String(v?.stuid) === String(stuid) && v?.stoken)
				const sk = matches[0]?.[1]
				if (!sk) return false
				const params = `uid=${encodeURIComponent(stuid)}&stoken=${encodeURIComponent(sk.stoken)}&mid=${encodeURIComponent(sk.mid || '')}`
				const [ltokenRes, cookieRes] = await Promise.all([
					this.getData('getLtoken', { cookies: params }, true),
					this.getData('bbsGetCookie', { cookies: params }, true)
				])
				const ltoken = ltokenRes?.data?.ltoken || ltokenRes?.data?.token?.token
				const cookieToken = cookieRes?.data?.cookie_token || cookieRes?.data?.token?.token
				if (!ltoken || !cookieToken || !sk.mid) return false
				const updated = {}
				for (const [key, record] of matches) {
					record.ltoken = ltoken
					updated[key] = record
				}
				gsCfg.saveBingStoken(this.userId, updated)
				const ck = utils.buildV2Cookie({ ltuid: stuid, ltoken, cookieToken, mid: sk.mid })
				try {
					const userModule = await import(`file://${_path}/plugins/genshin/model/user.js`)
					const bindEvent = {
						...(this.e || {}),
						user_id: this.userId,
						ck,
						msg: ck,
						raw_message: ck,
						AutoupCookie: true,
						logFnc: '[CK自动刷新]'
					}
					const saved = await new userModule.default(bindEvent).bing()
					if (!saved) {
						logger.warn(`[CK自动刷新] Genshin User.bing 校验或保存失败 stuid:${stuid}`)
						return false
					}
				} catch (error) {
					logger.warn(`[CK自动刷新] Genshin User.bing 更新失败: ${error.message}`)
					return false
				}
				return ck
			} catch (error) {
				logger.error(`[CK自动刷新] ${error.message}`)
				return false
			}
		})()
		miHoYoApi.ckRefreshTasks.set(stuid, task)
		try { return await task } finally { miHoYoApi.ckRefreshTasks.delete(stuid) }
	}

	getStoken(userId) {
		let file = `${yamlDataUrl}/${userId}.yaml`
		try {
			let ck = fs.readFileSync(file, 'utf-8')
			ck = YAML.parse(ck)
			if (ck?.uid) {
				let datalist = {};
				ck.userId = this.e.user_id
				datalist[ck.uid] = ck;
				ck = datalist
				gsCfg.saveBingStoken(this.e.user_id, datalist)
			}
			return ck[this.e.uid] || Object.values(ck || {}).find(item => item?.stoken && item?.stuid) || {}
		} catch (error) {
			return {}
		}
	}
	encrypt_data(data) {
		if (!data) return '';
		return crypto.publicEncrypt({
			key: mys.publicKey,
			padding: crypto.constants.RSA_PKCS1_PADDING
		}, data).toString("base64")
	}
	getDs2(q = "", b, salt) {
		let i = Math.floor(Date.now() / 1000)
		let r = _.random(100001, 200000)
		let add = `&b=${b}&q=${q}`
		let c = md5("salt=" + salt + "&t=" + i + "&r=" + r + add)
		return `${i},${r},${c}`
	}

	getDs(salt = mys.saltWeb) {
		const randomStr = utils.randomString(6);
		const timestamp = Math.floor(Date.now() / 1000)
		let sign = md5(`salt=${salt}&t=${timestamp}&r=${randomStr}`);
		return `${timestamp},${randomStr},${sign}`
	}

	async getAgent() {
		const cfg = await import(`file://${_path}/lib/config/config.js`)
		const proxyAddress = cfg.default.bot.proxyAddress
		if (!proxyAddress || proxyAddress === 'http://0.0.0.0:0') return null
		if (!this.isOs) return null

		if (HttpsProxyAgent === '') {
			HttpsProxyAgent = await import('https-proxy-agent').catch((err) => {
				logger.error(err)
			})
			HttpsProxyAgent = HttpsProxyAgent ? HttpsProxyAgent.default : undefined
		}
		return HttpsProxyAgent ? new HttpsProxyAgent(proxyAddress) : null
	}
}
