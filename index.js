const	ACTION_DELAY_THROW_ROD	= [6023, 6798],		// [Min, Max] in ms, 1000 ms = 1 sec
		ACTION_DELAY_FISH_START	= [1345, 2656],		// [Min, Max] - the pressing of F button to reel and start the minigame
		ACTION_DELAY_FISH_CATCH	= [5564, 15453],	// [Min, Max] - time to win the fishing minigame and get a fish as prize
		DELAY_BASED_ON_FISH_TIER= true; // tier 4 would get caught 4 sec longer, BAF (tier 11) would get caught 11 sec longer etc

const	path = require('path'),
		fs = require('fs');
				
const BAIT_RECIPES = [
	{baitName: "初阶级鱼饵",	itemId: 206001, recipeId: 204100},
	{baitName: "中阶级鱼饵",	itemId: 206002, recipeId: 204101},
	{baitName: "高阶级鱼饵",	itemId: 206003, recipeId: 204102},
	{baitName: "最高阶级鱼饵",	itemId: 206004, recipeId: 204103}
];
		
module.exports = function LetMeFish(mod) {
	const command = mod.command;
	
	let enabled = false,
		scanning = false,
		too_much_fishes = false,
		triedDismantling = false,
		myGameId = 0n,
		statFished = 0,
		statFishedTiers = {},
		hooks = [],
		dismantleFish = true,
		dismantleFishGold = false,
		thefishes = [],
		curTier = 0,
		timer = null,
		rodId = 0,
		baitId = 0,
		craftId = 0,
		leftArea = 0,
		putinfishes = 0,
		playerLoc = null,
		vContractId = null,
		invenItems = [],
		statStarted = null,
		gSettings = {},
		settingsFileName,
		hasNego = mod.manager.isLoaded('auto-nego'),
		pendingDeals = [],
		negoWaiting = false;
	
	function saveSettings(obj) {
		if (Object.keys(obj).length) {
			try {
				fs.writeFileSync(path.join(__dirname, settingsFileName), JSON.stringify(obj, null, "\t"));
			} catch (err) {
				command.message("Error saving settings " + err);
				console.log("Error saving settings " + err);
				return false;
			}
		}
	}
	
	function loadSettings() {
		try {
			return JSON.parse(fs.readFileSync(path.join(__dirname, settingsFileName), "utf8"));
		} catch (err) {
			command.message("Error loading settings " + err);
			console.log("Error loading settings " + err);
			return {};
		}
	}
	
	if (!fs.existsSync(path.join(__dirname, './saves'))) {
		fs.mkdirSync(path.join(__dirname, './saves'));
	}
	
	function send(msg) {
		mod.command.message([...arguments].join('\n\t - '))
	}
	
	command.add('fish', (arg) => {
        if (!arg) {
            enabled = !enabled;
			command.message("模组: " + (enabled ? "开启" : "关闭"));
			if (enabled) {
				start();
				scanning = true;
				let stepN = 1;
				if (!craftId) {
					command.message(stepN + ") 点击制作一次 - 你想要自动[合成鱼饵]的配方");
					stepN++;
				}
				command.message(stepN + ") 抛出鱼竿 - 自动钓鱼系统将启动");
			} else {
				Stop();
			}
		} else {
			switch (arg) {
				case "dismantle":
				case "分解":
					dismantleFish = !dismantleFish;
					command.message("自动分解[普通鱼肉] " + (dismantleFish ? "启用" : "禁用"));
					break;
				case "gold":
				case "大物":
					dismantleFishGold = !dismantleFishGold;
					command.message("自动分解[大物鱼肉] " + (dismantleFishGold ? "启用" : "禁用"));
					break;
				case "reset":
				case "重置":
					dismantleFish = true;
					dismantleFishGold = false;
					craftId = 0;
					baitId = 0;
					send(
						"[分解鱼肉]类型 已重置",
						"[合成鱼饵]配方 已重置",
						"使用[鱼饵]类型 已重置"
					);
					break;
				case "status":
				case "状态":
					send(
						"模组: " + (enabled ? "开启" : "关闭"),
						"[分解鱼肉]类型: " + (dismantleFish ? "[普通鱼类]" : "") + (dismantleFishGold ? "[大物鱼类]" : ""),
						"[合成鱼饵]配方: " + (craftId ? craftId : "空"),
						"使用[鱼饵]类型: " + (baitId ? baitId : "空")
					);
					break;
				case "save":
				case "保存":
					command.message("保存设置");
					gSettings.dismantleFish = dismantleFish;
					gSettings.dismantleFishGold = dismantleFishGold;
					gSettings.craftId = craftId;
					gSettings.baitId = baitId;
					saveSettings(gSettings);
					break;
				case "load":
				case "读取":
					command.message("读取设置");
					gSettings = loadSettings();
					dismantleFish = gSettings.dismantleFish;
					dismantleFishGold = gSettings.dismantleFishGold;
					craftId = gSettings.craftId;
					let found = BAIT_RECIPES.find(obj => obj.recipeId === craftId);
					if (found) {
						baitId = found.itemId;
					} else {
						command.message("配置文件已损坏，[合成鱼饵]配方ID错误!");
					}
					break;
				default :
					command.message("无效的参数!")
					break;
			}
		}
	});
	
	function addZero(i) {
		if (i < 10) {
			i = "0" + i;
		}
		return i;
	}
	
	function rng([min, max]) {
		return min + Math.floor(Math.random() * (max - min + 1));
	}
	
	function Stop() {
		enabled = false
		vContractId = null;
		putinfishes = 0;
		clearTimeout(timer);
		unload();
		
		if (!scanning) {
			let d = new Date();
			let t = d.getTime();
			let timeElapsedMSec = t-statStarted;
			d = new Date(1970, 0, 1); // Epoch
			d.setMilliseconds(timeElapsedMSec);
			let h = addZero(d.getHours());
			let m = addZero(d.getMinutes());
			let s = addZero(d.getSeconds());
			command.message('- 统计: ' + statFished + ' 条鱼')
			command.message('- 用时: ' + (h + ":" + m + ":" + s))
			command.message('- 平均: ' + Math.round((timeElapsedMSec / statFished) / 1000) + ' 秒/条鱼');
			command.message('- 鱼类:');
			for (let i in statFishedTiers) {
				command.message('- 等级[' + i + '] ' + statFishedTiers[i] + '条');
			}
			statFished = 0;
			statFishedTiers = {};
		} else {
			command.message('自动钓鱼系统...脚本停止!');
		}
	}
	
	function reel_the_fish() {
		mod.toServer("C_START_FISHING_MINIGAME", 1, {
			
		});
	}
	
	function catch_the_fish() {
		statFished++;
		mod.toServer("C_END_FISHING_MINIGAME", 1, {
			success: true
		});
		timer = setTimeout(throw_the_rod, rng(ACTION_DELAY_THROW_ROD));
	}
	
	function throw_the_rod() {
		if (pendingDeals.length) {
			command.message("Lets address suggested deals and give it some time...");
			//console.log("nego start wait");
			
			for (let i = 0; i < pendingDeals.length; i++) {
				mod.toClient('S_TRADE_BROKER_DEAL_SUGGESTED', 1, pendingDeals[i]);
				pendingDeals.splice(i--, 1);
			}
			negoWaiting = true;
			timer = setTimeout(throw_the_rod, (rng(ACTION_DELAY_THROW_ROD)*6));
		} else if (rodId) {
			negoWaiting = false;
			mod.toServer('C_USE_ITEM', 3, {
				gameId: myGameId,
				id: rodId,
				dbid: 0n, // dbid is sent only when used from inventory, but not from quickslot
				target: 0n,
				amount: 1,
				dest: 0,
				loc: playerLoc.loc,
				w: playerLoc.w,
				unk1: 0,
				unk2: 0,
				unk3: 0,
				unk4: true
			});
		} else {
			command.message("抛竿前 需要激活鱼饵BUFF...脚本停止!");
			Stop();
		}
	}
	
	function use_bait_item() {
		if (baitId) {
			mod.toServer('C_USE_ITEM', 3, {
				gameId: myGameId,
				id: baitId,
				dbid: 0n, // dbid is sent only when used from inventory, but not from quickslot
				target: 0n,
				amount: 1,
				dest: 0,
				loc: playerLoc.loc,
				w: playerLoc.w,
				unk1: 0,
				unk2: 0,
				unk3: 0,
				unk4: true
			});
			timer = setTimeout(throw_the_rod, rng(ACTION_DELAY_THROW_ROD));
		} else {
			command.message("未激活 背包中的鱼饵BUFF...脚本停止!");
			Stop();
		}
	}
	
	function cleanup_by_dismantle() {
		if (enabled) {
			if (dismantleFish || dismantleFishGold) {
				thefishes.length = 0;
				
				if (dismantleFish) {
					thefishes = thefishes.concat(invenItems.filter((item) => item.id >= 206400 && item.id <= 206435));
				}
				
				if (dismantleFishGold) {
					thefishes = thefishes.concat(invenItems.filter((item) => item.id >= 206500 && item.id <= 206505));
				}
				
				if (thefishes.length > 20) {
					too_much_fishes = true;
					while (thefishes.length > 20) {
						thefishes.pop();
					}
				} else {
					too_much_fishes = false;
				}
				
				if (thefishes.length) {
					command.message("已添加分解项目 " + thefishes.length + "条鱼");
					if (!vContractId) {
						mod.toServer('C_REQUEST_CONTRACT', 1, {
							type: 89
						});
					}
					timer = setTimeout(dismantle_put_in_one_fish, (rng(ACTION_DELAY_FISH_START)+1000));
				} else {
					command.message("你的背包里没有可分解的[鱼], 空间不足...脚本停止!");
					Stop();
				}
			} else {
				command.message("[分解鱼肉]类型全部禁用, 空间不足...脚本停止!");
				Stop();
			}
		}
	}
	
	function dismantle_put_in_one_fish() {
		if (vContractId) {
			const thefish = thefishes.pop();
			putinfishes++;
			
			mod.toServer('C_RQ_ADD_ITEM_TO_DECOMPOSITION_CONTRACT', 2, {
				contractId: vContractId,
				dbid: thefish.dbid,
				id: thefish.id,
				count: 1
			});

			if (thefishes.length) {
				timer = setTimeout(dismantle_put_in_one_fish, (rng(ACTION_DELAY_FISH_START)/4));
			} else {
				timer = setTimeout(dismantle_start0, (rng(ACTION_DELAY_FISH_START)/2));
			}
		} else {
			command.message("由于某种原因(log?)[分解鱼肉]失败...稍后重试");
			timer = setTimeout(cleanup_by_dismantle, (rng(ACTION_DELAY_FISH_START)+1500));
		}
	}
	
	function dismantle_start0() {
		mod.toServer('C_RQ_START_SOCIAL_ON_PROGRESS_DECOMPOSITION', 1, {
			contract: vContractId
		});
		
		timer = setTimeout(dismantle_start1, 1925);
	}
	
	function dismantle_start1() {
		putinfishes = 0;
		
		mod.toServer('C_RQ_COMMIT_DECOMPOSITION_CONTRACT', 1, {
			contract: vContractId
		});
		
		if (too_much_fishes) {
			cleanup_by_dismantle();
		} else {
			setTimeout(dismantle_start2, rng(ACTION_DELAY_FISH_START)); // lets not let user cancel that
		}
	}
	
	function dismantle_start2() {
		mod.toServer('C_CANCEL_CONTRACT', 1, {
			type: 89,
			id: vContractId
		});
		
		vContractId = null;
		if (enabled) {
			timer = setTimeout(throw_the_rod, rng(ACTION_DELAY_THROW_ROD)); // lets resume fishing
		}
	}
	
	function craft_bait_start() {
		if (craftId) {
			let filets = invenItems.find((item) => item.id === 204052);
			if (filets && filets.amount >= 60) { // need one more to trigger "can't craft more bait"
				triedDismantling = false;
				mod.toServer('C_START_PRODUCE', 1, {
					recipe: craftId,
					unk: 0
				});
			} else if (!triedDismantling) {
				triedDismantling = true;
				timer = setTimeout(cleanup_by_dismantle, rng(ACTION_DELAY_THROW_ROD));
				command.message("你没有足够的[鱼肉]来制作[鱼饵]...尝试分解鱼肉");
			} else {
				command.message("你没有足够的[鱼肉]来制作[鱼饵]...脚本停止!");
				Stop();
			}
		} else {
			command.message("你没有设置[合成鱼饵]配方...脚本停止!");
			Stop();
		}
	}
	
	mod.hook('C_PLAYER_LOCATION', 5, event => {
		playerLoc = event;
	});
	
	mod.hook('S_LOGIN', 12, event => {
		myGameId = event.gameId;
		invenItems = [];
		rodId = null;
		vContractId = null;
		putinfishes = 0;
		settingsFileName = `./saves/${event.name}-${event.serverId}.json`;
		let lSettings = loadSettings();
		if (!Object.keys(lSettings).length) {
			baitId = 0;
			craftId = 0;
			dismantleFish = true;
			dismantleFishGold = false;
		} else {
			dismantleFish = lSettings.dismantleFish || true;
			dismantleFishGold = lSettings.dismantleFishGold || false;
			craftId = lSettings.craftId || 0;
			let found = BAIT_RECIPES.find(obj => obj.recipeId === craftId);
			if (found) {
				baitId = found.itemId;
			} else {
				command.message("配置文件已损坏，[合成鱼饵]配方ID错误!");
			}
			/*console.log("LOADED SETTINGS: ");
			console.log(dismantleFish);
			console.log(craftId);
			console.log(baitId);*/
		}
	});
	
	function start() {
		if (hooks.length) return;
		
		Hook('S_START_FISHING_MINIGAME', 1, event => {
			if (!enabled || scanning) return;
			
			//let eventgameId = BigInt(data.readUInt32LE(8)) | BigInt(data.readUInt32LE(12)) << 32n;
			if(myGameId === event.gameId) {
				let fishTier = event.level; //data.readUInt8(16);
				if (DELAY_BASED_ON_FISH_TIER) {
					curTier = fishTier;
				}
				statFishedTiers[fishTier] = statFishedTiers[fishTier] ? statFishedTiers[fishTier]+1 : 1;
				//console.log("size of statFishedTiers now: " + (Object.keys(statFishedTiers).length));
				//console.log(statFishedTiers);
				command.message("自动完成[迷你钓鱼]游戏 - [等级" + fishTier + "]");
				timer = setTimeout(catch_the_fish, (rng(ACTION_DELAY_FISH_CATCH)+(curTier*1000)));
				return false; // lets hide that minigame
			}
		});
		
		Hook('S_FISHING_BITE', 2, event => {
			if (!enabled) return;
			
			//let eventgameId = BigInt(data.readUInt32LE(8)) | BigInt(data.readUInt32LE(12)) << 32n;
			if (myGameId === event.gameId) {
				timer = setTimeout(reel_the_fish, rng(ACTION_DELAY_FISH_START));
				leftArea = 0;
				if (scanning) {
					scanning = false;
					rodId = event.rodId;
					let d = new Date();
					statStarted = d.getTime();
					command.message("当前选择鱼竿: " + rodId);
					if (!dismantleFish) {
						command.message("已禁用了[分解鱼肉]类型, 当[背包]空间不足时自动钓鱼系统将停止");
					}
					if (!craftId) {
						command.message("没有配置[合成鱼饵]配方, 当[鱼饵]用尽时自动钓鱼系统将停止");
					}
					command.message("自动钓鱼系统...脚本开始!");
				}
				command.message("好像有[鱼]上钩了哟~");
				return false; // lets hide and enjoy peace of mind with no temptation to smash "F" button
			}
		});
		
		Hook('S_INVEN', 16, event => {
			if (!enabled) return;
			
			invenItems = event.first ? event.items : invenItems.concat(event.items);
		});
		
		Hook('S_REQUEST_CONTRACT', 1, event => {
			if (!enabled || scanning || event.type != 89 || event.senderId !== myGameId) return;
			
			vContractId = event.id;
			command.message("获取[分解合同]ID: " + event.id);
		});
		
		Hook('S_CANCEL_CONTRACT', 1, event => {
			if (!enabled || scanning || event.type != 89 || event.id != vContractId || event.senderId !== myGameId) return;
			
			vContractId = null;
			command.message("取消[分解合同]...稍后重试排序");
			clearTimeout(timer);
			timer = setTimeout(throw_the_rod, rng(ACTION_DELAY_THROW_ROD));
		});
		
		Hook('C_START_PRODUCE', 1, event => {
			if (!scanning) return;
			
			craftId = event.recipe;
			let found = BAIT_RECIPES.find(obj => obj.recipeId === event.recipe);
			if (found) {
				baitId = found.itemId;
				send(
					"已用尽背包[鱼饵] " + found.baitName,
					"使用这个配方[合成鱼饵]: " + craftId,
					"并且激活使用这个[鱼饵]: " + baitId
				);
			} else {
				command.message("自动[合成鱼饵]失败!");
			}
		});
		
		Hook('S_END_PRODUCE', 1, event => {
			if (!enabled || scanning) return;
			
			if (event.success) {
				craft_bait_start(); // no need to wait, client doesn't (when you click "craft all")
			}
		});
		
		Hook('S_TRADE_BROKER_DEAL_SUGGESTED', 1, event => {
			if (enabled && !scanning && hasNego && !negoWaiting && event.offeredPrice === event.sellerPrice) { // lets take a break and trade shall we?
				for (let i = 0; i < pendingDeals.length; i++) {
					let deal = pendingDeals[i];
					if (deal.playerId == event.playerId && deal.listing == event.listing) pendingDeals.splice(i--, 1);
				}
				pendingDeals.push(event);
				//console.log("nego deal suggested");
				command.message("Nego deal was suggested, gonna address it after current fish...")
				return false;
			}
		});
		
		Hook('S_SYSTEM_MESSAGE', 1, event => {
			if (!enabled || scanning) return;
			const msg = mod.parseSystemMessage(event.message);
			//command.message(msg.id);
			
			if (msg.id === 'SMT_CANNOT_FISHING_NON_BAIT') { // out of bait
				command.message("背包[鱼饵]已用尽...开始[合成鱼饵]");
				clearTimeout(timer);
				timer = setTimeout(craft_bait_start, rng(ACTION_DELAY_FISH_START));
			} else if (msg.id === 'SMT_ITEM_CANT_POSSESS_MORE') { // craft limit 
				if (!vContractId) {
					command.message("背包[鱼饵]饱和...开始[自动钓鱼]");
					clearTimeout(timer);
					timer = setTimeout(use_bait_item, rng(ACTION_DELAY_FISH_START));
				} else { // 10k filet // 3 error sysmsgs at once for that lol
					command.message("背包[鱼肉]携带量接近饱和(10k)...脚本停止!");
					clearTimeout(timer);
					if (putinfishes) {
						too_much_fishes = false;
						enabled = false;
						dismantle_start0();
						setTimeout(Stop, (rng(ACTION_DELAY_FISH_START)+4000));
					} else {
						Stop();
					}
				}
			} else if (msg.id === 'SMT_CANNOT_FISHING_FULL_INVEN') { // full inven
				command.message("背包空间不足...开始[分解鱼肉]");
				clearTimeout(timer);
				timer = setTimeout(cleanup_by_dismantle, rng(ACTION_DELAY_FISH_START));
			} else if (msg.id === 'SMT_CANNOT_FISHING_NON_AREA' && !negoWaiting) { // server trolling us?
				command.message("钓鱼取消, 离开钓鱼区域...稍后重试");
				clearTimeout(timer);
				leftArea++;
				if (leftArea < 7) {
					timer = setTimeout(throw_the_rod, rng(ACTION_DELAY_THROW_ROD));
				} else {
					Stop();
					command.message("钓鱼取消, 你好像离开了钓鱼区域....脚本停止!");
				}
			} else if (msg.id === 'SMT_FISHING_RESULT_CANCLE') { // hmmm?
				command.message("钓鱼取消...稍后重试");
				clearTimeout(timer);
				timer = setTimeout(throw_the_rod, rng(ACTION_DELAY_FISH_START));
			} else if (msg.id === 'SMT_YOU_ARE_BUSY') { // anti-anit-bot
				command.message("Evil people trying to disturb your fishing... lets try again?");
				clearTimeout(timer);
				timer = setTimeout(throw_the_rod, rng(ACTION_DELAY_THROW_ROD));
			} else if (negoWaiting && !pendingDeals.length && msg.id === 'SMT_MEDIATE_SUCCESS_SELL') { // all out of deals and still waiting?
				command.message('All negotiations finished... resuming fishing shortly')
				//console.log("nego end wait OK");
				clearTimeout(timer);
				timer = setTimeout(throw_the_rod, (rng(ACTION_DELAY_THROW_ROD)+1000));
			} else if (msg.id === 'SMT_CANNOT_USE_ITEM_WHILE_CONTRACT') { // we want to throw the rod but still trading?
				negoWaiting = true;
				command.message('Negotiations are taking long time to finish... lets wait a bit more')
				//console.log("nego long wait");
				clearTimeout(timer);
				timer = setTimeout(throw_the_rod, (rng(ACTION_DELAY_THROW_ROD)+3000));
			}
		});
	}
	
	function Hook() {
		hooks.push(mod.hook(...arguments));
	}
	
	function unload() {
		if (hooks.length) {
			for(let h of hooks) mod.unhook(h);
			hooks = [];
		}
	}
	
}
