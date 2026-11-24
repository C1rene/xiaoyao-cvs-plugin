const APP_VERSION = "2.70.1";
const mhyVersion = "2.11.1";
const salt = "S9Hrn38d2b55PamfIR9BNA3Tx9sQTOem"; //k2
const salt2 = "LyD1rXqMv2GJhnwdvCBjFOKGiKuLY3aO"; //x6
const saltWeb = "sjdNFJB7XxyDWGIAk0eTV8AOCfMJmyEo";//lk2
const oldsalt = "z8DRIUjNDT7IT5IZXvrUAxyupA1peND9";
const passSalt = 'JwYDpKvLj6MrMqqYU6jTKF17KNO2PXoS';
const osSalt = ''; //599uqkwc0dlqu3h6epzjzfhgyyrd44ae rk4xg2hakoi26nljpr099fv9fck1ah10
const osSaltWeb = ''; //os 浏览帖子需要用到的salt
const web_api = `https://api-takumi.mihoyo.com`
const os_web_api = `https://api-os-takumi.mihoyo.com`
const os_hk4_api = `https://hk4e-api-os.hoyoverse.com`;
const hk4_api = `https://hk4e-api.mihoyo.com`;
const pass_api = `https://passport-api.mihoyo.com`
const app_id = 2
const publicKey = `-----BEGIN PUBLIC KEY-----
MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQDDvekdPMHN3AYhm/vktJT+YJr7cI5DcsNKqdsx5DZX0gDuWFuIjzdwButrIYPNmRJ1G8ybDIF7oDW2eEpm5sMbL9zs
9ExXCdvqrn51qELbqj0XxtMTIpaCHFSI50PfPpTFV9Xt/hmyVwokoOXFlAEgCn+Q
CgGs52bFoYMtyi+xEQIDAQAB
-----END PUBLIC KEY-----`
const boards = {
	honkai3rd: {
		key: 'honkai3rd',
		biz: 'bh3_cn',
		name: '崩坏3',
		url: "https://bbs.mihoyo.com/bh3/"
	},
	genShin: {
		key: 'genshin',
		biz: 'hk4e_cn',
		osbiz: 'hk4e_global',
		name: '原神',
		url: "https://bbs.mihoyo.com/ys/"
	},
	honkai2: {
		biz: 'bh2_cn',
		name: '崩坏2',
		url: "https://bbs.mihoyo.com/bh2/"
	},
	tears: {
		biz: 'nxx_cn',
		name: '未定事件簿',
		url: "https://bbs.mihoyo.com/wd/"
	},
	house: {
		name: '大别野',
		url: "https://bbs.mihoyo.com/dby/"
	},
	honkaisr: {
		biz: 'hkrpg_cn',
		osbiz: 'hkrpg_global',
		name: '崩坏星穹铁道',
		url: "https://bbs.mihoyo.com/sr/"
	},
	zzz: {
		biz: 'nap_cn',
		osbiz: 'nap_global',
		name: "绝区零",
		url: "https://bbs.mihoyo.com/zzz/"
	}
}

export default {
	APP_VERSION,
	mhyVersion,
	salt,
	salt2,
	saltWeb,
	oldsalt,
	osSaltWeb,
	web_api,
	os_web_api,
	os_hk4_api, app_id,
	hk4_api,
	publicKey,
	pass_api, passSalt,
	boards
}
