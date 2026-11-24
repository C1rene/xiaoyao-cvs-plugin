import YAML from 'yaml'
import fs from 'node:fs'
import {
	promisify
} from 'node:util'
import lodash from 'lodash'
const plugin = "xiaoyao-cvs-plugin"
/**
 * 配置文件
 * 主要用于处理 stoken 账号数据
 */
const _path = process.cwd();
class GsCfg {
	constructor() {

	}
	/** 通用yaml读取*/
	getfileYaml(path, name) {
		this.cpCfg('config', 'config')
		return YAML.parse(
			fs.readFileSync(path + name + ".yaml", 'utf8')
		)
	}
	cpCfg (app, name) {
	  if (!fs.existsSync(`./plugins/${plugin}/config`)) {
	    fs.mkdirSync(`./plugins/${plugin}/config`)
	  }
	
	  let set = `./plugins/${plugin}/config/${name}.yaml`
	  if (!fs.existsSync(set)) {
	    fs.copyFileSync(`./plugins/${plugin}/defSet/${app}/${name}.yaml`, set)
	  }
	}
	async getMasterQQ() {
		const config = (await import(`file://${_path}/lib/config/config.js`)).default
		return config.masterQQ[0]
	}
	/** 读取用户绑定的ck */
	async getBingCk() {
		let ck = {}
		let ckQQ = {}
		let dir = './data/MysCookie/'
		let files = fs.readdirSync(dir).filter(file => file.endsWith('.yaml'))

		const readFile = promisify(fs.readFile)

		let promises = []

		files.forEach((v) => promises.push(readFile(`${dir}${v}`, 'utf8')))

		const res = await Promise.all(promises)

		res.forEach((v) => {
			let tmp = YAML.parse(v)
			lodash.forEach(tmp, (v, i) => {
				ck[String(i)] = v
				if (v.isMain && !ckQQ[String(v.qq)]) {
					ckQQ[String(v.qq)] = v
				}
			})
		})

		return {
			ck,
			ckQQ
		}
	}
	
	/** 读取所有用户绑定的ck */
	async getBingAllCk () {
	  let ck = {}
	  let ckQQ = {}
	  let qqCk={}
	  let dir = './data/MysCookie/'
	  let files = fs.readdirSync(dir).filter(file => file.endsWith('.yaml'))
	
	  const readFile = promisify(fs.readFile)
	
	  let promises = []
	
	  files.forEach((v) => promises.push(readFile(`${dir}${v}`, 'utf8')))
	
	  const res = await Promise.all(promises)
	
	  res.forEach((v) => {
	    let tmp = YAML.parse(v)
	    let qq
	    lodash.forEach(tmp, (item, uid) => {
	      qq = item.qq
	      ck[String(uid)] = item
		  if(!qqCk[String(item.qq)]) qqCk[String(item.qq)]=[]
		  qqCk[String(item.qq)].push(item)
	      if (item.isMain && !ckQQ[String(item.qq)]) {
	        ckQQ[String(item.qq)] = item
	      }
	    })
	    if (qq && !ckQQ[String(qq)]) {
	      ckQQ[String(qq)] = Object.values(tmp)[0]
	    }
	  })
	
	  return { ck, ckQQ,qqCk }
	}
	
	async getUserStoken(userId){
		try {
			const dir = `plugins/${plugin}/data/yaml`;
			const file = `${dir}/${userId}.yaml`;
			if (!fs.existsSync(file)) return {};
			return YAML.parse(fs.readFileSync(file, 'utf8')) || {};
		} catch (ex) {
			return {};
		}
	}

	/** 读取所有用户绑定的stoken */
	async getBingStoken() {
		let ck = []
		let ckQQ = {}
		let dir = `plugins/${plugin}/data/yaml/`
		if (!fs.existsSync(dir)) return ck
		let files = fs.readdirSync(dir).filter(file => file.endsWith('.yaml'))

		const readFile = promisify(fs.readFile)

		let promises = []

		files.forEach((v) => promises.push(readFile(`${dir}${v}`, 'utf8')))
		const res = await Promise.all(promises)
		res.forEach((v, index) => {
			let tmp = YAML.parse(v)
			ck.push(tmp)
		})
		return ck
	}
	getBingCkSingle(userId) {
		let file = `./data/MysCookie/${userId}.yaml`
		try {
			let ck = fs.readFileSync(file, 'utf-8')
			ck = YAML.parse(ck)
			return ck
		} catch (error) {
			return {}
		}
	}
	getBingCookie(userId) {
		let file = `./data/MysCookie/${userId}.yaml`
		try {
			let ck = fs.readFileSync(file, 'utf-8')
			ck = YAML.parse(ck)
			for (let item in ck) {
				let login_ticket;
				if (!ck[item].isMain) {
					continue;
				}
				login_ticket = ck[item]?.login_ticket
				ck = ck[item].ck
				return {
					ck,
					item,
					login_ticket
				};
			}
		} catch (error) {
			return {}
		}
	}
	syncGenshinStoken(userId, sourceFile) {
		let targetDir = './plugins/genshin/yaml'
		let targetFile = `${targetDir}/${userId}.yaml`
		if (!fs.existsSync(targetDir)) {
			fs.mkdirSync(targetDir, { recursive: true })
		}
		if (fs.existsSync(sourceFile)) {
			fs.copyFileSync(sourceFile, targetFile)
		} else if (fs.existsSync(targetFile)) {
			fs.unlinkSync(targetFile)
		}
	}
	saveBingStoken(userId, data) {
		// 确保目录存在，并同步合并，避免首次扫码 ENOENT 和多 UID 写入互相覆盖。
		const dir = `./plugins/${plugin}/data/yaml`;
		const file = `${dir}/${userId}.yaml`;
		fs.mkdirSync(dir, { recursive: true });
		if (lodash.isEmpty(data)) {
			if (fs.existsSync(file)) fs.unlinkSync(file);
			this.syncGenshinStoken(userId, file);
			return true;
		}
		let current = {};
		if (fs.existsSync(file)) {
			try { current = YAML.parse(fs.readFileSync(file, 'utf8')) || {}; }
			catch (error) { Bot.logger?.warn?.(`[SK保存] 原有 YAML 解析失败，将重建文件：${error.message}`); }
		}
		// 兼容旧版本直接保存单条 { uid, stuid, ... } 的格式。
		if (current?.uid && current?.stoken) {
			const legacy = current;
			current = { [String(legacy.uid)]: legacy };
		}
		const incoming = data?.uid && data?.stoken ? { [String(data.uid)]: data } : data;
		current = { ...current, ...incoming };
		fs.writeFileSync(file, YAML.stringify(current), 'utf8');
		this.syncGenshinStoken(userId, file);
		return true;
	}

}


export default new GsCfg()
