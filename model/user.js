import YAML from 'yaml'
import miHoYoApi from "../model/mys/mihoyoApi.js"
import fs from 'node:fs'
import lodash from 'lodash'
import utils from '../model/mys/utils.js';
import gsCfg from './gsCfg.js';
import mysConfig from './mys/mysTool.js';
import { Data } from "../components/index.js";

const _path = process.cwd();
const plugin = "xiaoyao-cvs-plugin"
const yamlDataUrl = `${_path}/plugins/xiaoyao-cvs-plugin/data/yaml`;

/**
 * 根据角色所属业务及服务器信息判断 SK 的服别。
 * game_biz 是查询角色时指定的业务标识，优先级最高；
 * region_name / region 只在 game_biz 缺失或无法识别时作为补充。
 */
function resolveSkType(role = {}, game = {}) {
    const gameBiz = String(role.game_biz || game.biz || '').trim().toLowerCase();
    const regionName = String(role.region_name || '').trim().toLowerCase();
    const region = String(role.region || '').trim().toLowerCase();
    const legacyType = String(role.type || '').trim().toLowerCase();

    const classifyBiz = (biz) => {
        if (!biz) return '';
        if (/(?:^|_)(?:cn|china)$/.test(biz)) return 'mys';
        if (/(?:^|_)(?:global|os|overseas|tw|hk|mo)$/.test(biz)) return 'hoyolab';
        return '';
    };

    const classifyRegionName = (name) => {
        if (!name) return '';
        if (/(国服|国区|大陆|中国|官服|渠道服|b服)/i.test(name)) return 'mys';
        if (/(国际服|海外服|全球服|美服|欧服|亚服|港澳台服|hoyolab|america|europe|asia|taiwan|hong\\s*kong|global)/i.test(name)) return 'hoyolab';
        return '';
    };

    const classifyRegion = (value) => {
        if (!value) return '';
        if (/^(?:cn_gf\\d*|cn_qd\\d*|prod_(?:gf|qd)_cn|cn_prod_gf\\d*)$/i.test(value)) return 'mys';
        if (/^(?:os_(?:usa|euro|asia|cht)|prod_official_(?:usa|eur|asia|cht))$/i.test(value)) return 'hoyolab';
        // android01 / ios01 等是游戏专属服务器代号，不能单独据此判断国服或国际服。
        return '';
    };

    const bizType = classifyBiz(gameBiz);
    const nameType = classifyRegionName(regionName);
    const regionType = classifyRegion(region);

    if (bizType) {
        if ((nameType && nameType !== bizType) || (regionType && regionType !== bizType)) {
            logger.warn(`[SK服别判断] game_biz=${gameBiz} 与 region_name=${regionName || '-'} / region=${region || '-'} 不一致，优先采用 game_biz 判定：${bizType}`);
        }
        return bizType;
    }

    if (nameType) {
        if (regionType && regionType !== nameType) {
            logger.warn(`[SK服别判断] region_name=${regionName} 与 region=${region || '-'} 不一致，优先采用 region_name 判定：${nameType}`);
        }
        return nameType;
    }

    if (regionType) return regionType;
    if (legacyType === 'mys' || legacyType === 'hoyolab') return legacyType;

    // 当前扫码角色查询列表均为 *_cn 业务；仅在缺少全部可判定信息时保守回落为国服。
    logger.warn(`[SK服别判断] 无法从 game_biz=${gameBiz || '-'}、region_name=${regionName || '-'}、region=${region || '-'} 判断服别，按当前国服查询业务回落为 mys`);
    return 'mys';
}
/** 配置文件 */
export default class user {
    constructor(e) {
        this.e = e;
        this.stokenPath = `./plugins/${plugin}/data/yaml/`
        this.ForumData = Data.readJSON(`${_path}/plugins/xiaoyao-cvs-plugin/defSet/json`, "mys")
    }

    async getData(type, data = {}, isck = true) {
        if (isck) {
            await this.cookie(this.e)
        }
        this.miHoYoApi = new miHoYoApi(this.e);
        let res = await this.miHoYoApi.getData(type, data)
        return res
    }

    async getCkData() {
        // 账号信息查询只展示已绑定的游戏 UID。
        const records = await gsCfg.getUserStoken(this.e.user_id);
        const sumData = {};
        const counters = { "原神": 0, "星穹铁道": 0 };
        for (const [key, record] of Object.entries(records || {})) {
            if (!record) continue;
            const uid = String(record.uid || '');
            if (!uid) continue;
            const isStarRail = String(record.region || "").startsWith("prod_");
            const gameName = isStarRail ? "星穹铁道" : "原神";
            counters[gameName] += 1;
            sumData[`${gameName}${counters[gameName]}`] = {
                "游戏UID": uid,
                "服务器": record.region_name || record.region || "未知"
            };
        }
        return sumData;
    }

    async docHelp() {
        const config = gsCfg.getfileYaml(`${_path}/plugins/xiaoyao-cvs-plugin/config/`, "config");
        return config.cookiesDoc;
    }

    async cookie(e) {
        let {
            cookie,
            uid,
            skuid
        } = await this.getCookie(e);
        let cookiesDoc = await this.getcookiesDoc();
        if (!cookie) {
            return false;
        }
        let stokens = this.getStoken(e.user_id)
        if (!stokens) {
            return true;
        }
        if (!cookie.includes("login_ticket") && !skuid?.login_ticket) {
            return false;
        }
        let flot = await this.stoken(cookie, e)
        await utils.sleepAsync(1000); //延迟加载防止文件未生成
        if (!flot) {
            return false;
        }
        return true;
    }

    async getcookiesDoc() {
        return await gsCfg.getfileYaml(`${_path}/plugins/xiaoyao-cvs-plugin/config/`, "config").cookiesDoc
    }

    async getCookie(e) {
        let skuid = await gsCfg.getBingCookie(e.user_id)
        let cookie = skuid?.ck
        let uid = skuid?.item
        if (!uid && e?.user?.getUid) {
            uid = e.user.getUid('gs')
            cookie = e.user.mysUser?.ck
        }
        if (!uid) {
            uid = e.runtime?.user?._regUid
        }
        this.e.uid = uid;
        this.e.cookie = cookie;
        return {
            cookie,
            uid,
            skuid
        }
    }

    async stoken(cookie, e) {
        this.e = e;
        let datalist = this.getStoken(e.user_id) || {}
        if (Object.keys(datalist).length > 0) {
            return true;
        }
        const map = await utils.getCookieMap(cookie);
        let loginTicket = map?.get("login_ticket");
        const loginUid = map?.get("login_uid") || map?.get("ltuid_v2") || map?.get("account_id_v2") || map?.get("ltuid") || map?.get("account_id");
        loginTicket = gsCfg.getBingCookie(e.user_id)?.login_ticket || loginTicket
        let mhyapi = new miHoYoApi(this.e);
        let res = await mhyapi.getData("bbsStoken", {
            loginUid,
            loginTicket
        }, false)
        if (res?.data) {
            datalist[e.uid] = {
                stuid: map?.get("account_id_v2") || map?.get("account_id"),
                stoken: res.data.list[0].token,
                ltoken: res.data.list[1].token,
                uid: e.uid,
                userId: e.user_id,
            }
            gsCfg.saveBingStoken(e.user_id, datalist)
        }
        return true;
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

    async seachUid(data, hideUidOutput = false) {
        let ltoken = '';
        if (data?.data) {
            let res;
            // 这些值需要在 Token 提取分支之外继续用于角色查询和持久化，必须定义在外层作用域。
            let stokenValue = '';
            let stuidValue = '';
            let midValue = '';
            if (this.e.sk) {
                stokenValue = this.e.sk.get('stoken') || this.e.sk.get('stoken_v2') || '';
                stuidValue = this.e.sk.get('stuid') || this.e.sk.get('uid') || '';
                midValue = this.e.sk.get('mid') || this.e.sk.get('account_mid_v2') || this.e.sk.get('ltmid_v2') || '';
                // QR 登录已经取得的 Ltoken 优先复用；其他入口统一走 Passport exchange type=2。
                ltoken = this.e.sk.get('ltoken') || this.e.sk.get('ltoken_v2') || '';
                if (!ltoken && stokenValue) {
                    const tokenCookies = `stoken=${stokenValue};stuid=${stuidValue};mid=${midValue || ''}`;
                    res = await this.getData('getLtoken', { cookies: tokenCookies }, false);
                    ltoken = res?.data?.token?.token || res?.data?.ltoken || '';
                }
                const cookieToken = data?.data?.cookie_token || data?.data?.token?.token;
                if (!cookieToken || !ltoken) {
                    logger.warn(`[SK绑定] Token 不完整，Cookie Token: ${Boolean(cookieToken)}，Ltoken: ${Boolean(ltoken)}`);
                    return false;
                }
                this.e.cookie = utils.buildV2Cookie({ ltuid: stuidValue, ltoken, cookieToken, mid: midValue });
            } else {
                // 兼容 login_ticket / 手动 Cookie 绑定入口。
                const originalCookie = String(this.e.original_msg || '');
                const originalMap = await utils.getCookieMap(originalCookie);
                stuidValue = String(this.e.stuid || originalMap.get('account_id_v2') || originalMap.get('ltuid_v2') || originalMap.get('account_id') || originalMap.get('ltuid') || originalMap.get('login_uid') || '');
                stokenValue = String(data?.data?.list?.find(item => item?.name === 'stoken' || item?.name === 'stoken_v2')?.token || data?.data?.list?.[0]?.token || '');
                midValue = String(originalMap.get('mid') || originalMap.get('account_mid_v2') || originalMap.get('ltmid_v2') || '');
                ltoken = String(data?.data?.list?.find(item => item?.name === 'ltoken')?.token || data?.data?.list?.[1]?.token || '');
                this.e.cookie = originalCookie;
                if (!ltoken && stokenValue) {
                    const tokenCookies = `stoken=${stokenValue};stuid=${stuidValue};mid=${midValue}`;
                    res = await this.getData('getLtoken', { cookies: tokenCookies }, false);
                    ltoken = res?.data?.token?.token || res?.data?.ltoken || '';
                }
            }
            // 角色查询直接复用 Genshin 的 MysApi / UserGame 实现。
            // 小遥旧版 userGameInfo 请求虽然使用同一接口，但请求头、设备指纹和 API 构造
            // 与 Genshin 不一致，容易出现 CK 有效但角色列表为空/请求失败的情况。
            const stuid = String(stuidValue || this.e.stuid || '');
            const stoken = String(stokenValue || '');
            const mid = String(midValue || '');
            const ck = String(this.e.cookie || '');
            if (!stuid || !stoken || !ltoken || !ck) {
                logger.warn(`[SK绑定] 登录凭据不完整：stuid=${Boolean(stuid)} stoken=${Boolean(stoken)} ltoken=${Boolean(ltoken)} ck=${Boolean(ck)}`);
                return false;
            }

            const { default: GenshinMysApi } = await import(`file://${process.cwd()}/plugins/genshin/model/mys/mysApi.js`);
            const gameBizList = [
                { biz: 'bh3_cn', name: '崩坏3' },
                { biz: 'hk4e_cn', name: '原神' },
                { biz: 'hkrpg_cn', name: '崩坏星穹铁道' },
                { biz: 'nap_cn', name: '绝区零' },
                { biz: 'bh2_cn', name: '崩坏2' },
                { biz: 'nxx_cn', name: '未定事件簿' },
            ];
            const roleMap = new Map();
            const queryErrors = [];
            for (const game of gameBizList) {
                try {
                    const option = {
                        game: 'bbs',
                        device: this.e.deviceId || undefined,
                        log: false
                    };
                    const queryData = { game_biz: game.biz }; // 同时区分 Genshin MysApi 的角色查询缓存键
                    // 将扫码阶段的设备身份直接交给 Genshin 请求层，避免它另行生成设备 ID/FP。
                    if (this.e.deviceId) queryData.deviceId = this.e.deviceId;
                    if (this.e.deviceFp) {
                        queryData.deviceFp = this.e.deviceFp;
                        queryData.headers = {
                            'x-rpc-device_id': this.e.deviceId,
                            'x-rpc-device_fp': this.e.deviceFp
                        };
                    }
                    const mysApi = new GenshinMysApi(stuid, ck, option, '', game.biz);
                    const result = await mysApi.getData('UserGame', queryData);
                    if (Number(result?.retcode) !== 0) {
                        queryErrors.push(`${game.biz}: ${result?.message || result?.retcode || '接口无有效响应'}`);
                        continue;
                    }
                    const roles = Array.isArray(result?.data?.list) ? result.data.list : [];
                    logger.mark(`[SK角色查询] ${game.biz} 返回 ${roles.length} 个角色`);
                    for (const role of roles) {
                        if (!role?.game_uid) continue;
                        const uid = String(role.game_uid);
                        roleMap.set(uid, {
                            stuid,
                            stoken,
                            ltoken,
                            mid,
                            uid,
                            userId: this.e.user_id,
                            type: resolveSkType({ ...role, game_biz: role.game_biz || game.biz }, game),
                            region_name: role.region_name || game.name,
                            region: role.region || game.biz,
                            game_biz: game.biz
                        });
                    }
                } catch (error) {
                    queryErrors.push(`${game.biz}: ${error.message}`);
                }
            }

            if (queryErrors.length > 0 && roleMap.size > 0) {
                logger.warn(`[SK角色查询] 部分游戏业务查询异常：${queryErrors.slice(0, 8).join(' | ')}`);
            }
            const datalist = Object.fromEntries(roleMap.entries());
            if (Object.keys(datalist).length === 0) {
                // 即使暂时没有查询到角色，也保存账号级 SK，避免已成功扫码的 Stoken 丢失。
                // 后续 #刷新ck 可重新交换 Token；重新查询角色时再补齐 UID。
                datalist[stuid] = {
                    stuid,
                    stoken,
                    ltoken,
                    mid,
                    uid: '',
                    userId: this.e.user_id,
                    type: 'mys',
                    region_name: '尚未查询到游戏角色',
                    region: 'cn_gf01',
                    pendingRoleQuery: true
                };
                logger.warn(`[SK角色查询] 所有业务均未返回角色，已保存账号级 SK。${queryErrors.slice(0, 8).join(' | ')}`);
            }
            const saved = await gsCfg.saveBingStoken(this.e.user_id, datalist);
            if (!saved) {
                logger.error(`[SK保存] YAML 写入失败，QQ=${this.e.user_id}`);
                return false;
            }
            const uids = [...roleMap.values()].map(item => `${item.region_name}:${item.uid}`);
            let msg = hideUidOutput ? 'stoken绑定成功您可通过下列指令进行操作:' : `${uids.length ? uids.join('\n') : '暂未查询到游戏角色，已保存账号 Stoken，可稍后使用刷新功能重试。'}\nstoken绑定成功您可通过下列指令进行操作:`;
            msg += '\n【#更新抽卡记录】更新抽卡记录'
            msg += '\n【#刷新ck】刷新失效cookie'
            msg += '\n【#我的stoken】查看绑定信息'
            msg += '\n【#删除stoken】删除绑定信息'
            this.e.reply(msg)
            return true
        }
        return false
    }

    async delSytk(path = yamlDataUrl, e) {
        await this.getCookie(e);
        let file = `${path}/${e.user_id}.yaml`
        fs.exists(file, (exists) => {
            if (!exists) {
                return true;
            }
            let ck = fs.readFileSync(file, 'utf-8')
            ck = YAML.parse(ck)
            if (ck) {
                if (!ck[e.uid]) {
                    return true;
                }
                let sk = ck[e.uid]
                lodash.forEach(ck, (v, i) => {
                    if (sk?.stoken === v?.stoken) {
                        delete ck[i];
                    }
                })
                if (Object.keys(ck).length === 0) {
                    fs.unlinkSync(file);
                } else {
                    ck = YAML.stringify(ck)
                    fs.writeFileSync(file, ck, 'utf8')
                }
            }
            e.reply('已删除stoken')
            return true;
        })
    }

    getDataList(name) {
        // mys.json 只保存游戏名称和别名，不包含接口所需的 biz/osbiz；
        // 真正的接口业务标识来自 mysTool.boards，不能直接把 mys.json 项传给 userGameInfo。
        const aliases = (this.ForumData || []).find(item =>
            item?.name === name || item?.otherName?.includes(name)
        );
        const board = Object.values(mysConfig.boards || {}).find(item => item?.name === (aliases?.name || name));
        return board ? [board] : [];
    }
}
