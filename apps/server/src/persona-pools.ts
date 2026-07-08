// Source material a generated persona draws from. Large + varied so seeded daemons don't correlate
// into an obvious fleet when a scanner sweeps many of our IPs.

/** MOTDs modeled on real small/medium servers; §-codes are vanilla color formatting. */
export const MOTD_POOL: readonly string[] = [
	"A Minecraft Server",
	"§aSurvival §7| §bSkyblock §7| §eEconomy",
	"§6§lThe Craftlands §r§7- now 1.21!",
	"§b✦ §fPvP Factions §b✦",
	"§2Vanilla SMP §8» §7whitelist on discord",
	"§dCreative Plots §7| build freely",
	"§c§lHARDCORE §r§7season 4",
	"§9§lAquaMC §r§7| §fseasonal events",
	"§7Private server — §cdo not join",
	"§e§lSkyBlockZ §r§8| §7/is to start",
	"§aMineVale Network §7| §b1000 slots",
	"§5§lEnderRealm §r§7survival + towny",
];

/** Common max-slot values with realistic weighting (small servers dominate). */
export const MAX_PLAYERS = [20, 20, 20, 50, 50, 100, 100, 200, 500, 1000] as const;

/** IANA-ish UTC offsets in minutes for major population centers. */
export const UTC_OFFSETS = [-480, -420, -360, -300, -240, 0, 60, 120, 330, 480, 540] as const;

/** Plausible player usernames — a mix of styles real rosters show. */
export const NAME_POOL: readonly string[] = ["mcxrty","Mikhaell_","UnTriz","_GloomShroom_","LF21Hungry","crqnel","destones","saber_ripkat2","Ezarton","Moss233","Motixiki","brunee_o","DunkeyKronk","Stryker123","ReaperSadTnT","tripedstroyer4","WinSweep","Genich19both09","sohoumous","Cinnamimic","YouHigh_","GangGetsAGuppy","wykuDMC","xByYun","AwsAR","forest3000","Ferrzpsz","SlimyBoy","lenzo18","Gespens","pboblo","PochiNya2","Tapewormcow","MiguelMunhoz","SpoonForkSpork","sleepy_goose_","ivolet_","sahrcc","Sakura_BaiNiao","Aoife_vr","Flowerestfell","Theropodasaurus","minehak","Klimuzz","tirilm","Viewbotter","Ghost163451","Bongchongles","Ayonic_","Sunk1zz","MrD7M","Lucnine","EliteEntity100","CalliFellAgain","AlphaMagma","Ty08","Lazycrowd","Hasbu1lita","Blobifie","xenor0","apusxx","Wisball","Adramelech__","SanniSkeleton","LEL_2010","Neexsilu","RATA_MEKANIKA","Fauxborisvv","fdevvin","mothsuop","Kattfratz","Kisash","DragonHunter5700","Catickle","Wombat_90","Heinzers","wkiii","Gwen_is_lmmune","Luboko","DZIK_Classic","NaeNae3","C4rdPl4yer","noninjaforyou","_little_bee","Harlefox","demfaxsYT","Sir_Henpai","turd3","ch4ppp","imbalistic","BigCup11","ITSREALGIO","Euphorja_","Paul11O","ItsN0tSilver","Artheoo","CaiVamp","Supreez","vinhxen","oyatskycastle","Naawar","lovebitten","Feallow","Behex","pogromca_bananow","StarryRainbeam","Fat_Lil_Rat","Diego23_Gamer","Faronux_","qP4xl1","Vildberi","moshrou","Kidaar2010","Minecraft_troll","BeanFish1236","w1lan4ell","Dionyo","TheRealSumisu","K1NGVSZF","tkdwld","wsgeorge_","uyayall","Tbyvxn","HEON_HEE","JoakyCraftSword","nekmew","jaszkus","faizo_YT","SkyeBear2019","Aydanishere","BatBurry","Postigod","CoffyCr","KenjiVA","HoloStonozka","kazann01","Imsuperdumb","PiekeChlebek","king_crimson_70","ZETAERRE","7R47","No0v","Phoenix613","UmbrellaCorp1212","Ederw13","DK_23trom","AlienBoi420","yiced","Pudding_Skibidi","SeFirox","Franco054","resha4","sarahbarah","esyzo","Larprist","Abydos_Nuobai","ItsKaiz_","BiSpiderX3","skibiti_toilet","ItPEOS","BluePatch15","soulful_scream","wearycauliflower","Engity","phylacterie","DerDome187","neddstool","glxtchdd","MrChocoso","gulius_228","ref10","kruziko","matilpp","evendemondsdie","PorotopMC","EKnumbers","BARTHO_MIGAJERO","zxcgoro","_TrustaGX_","Pemiz","AdoIf_Swagler","lolepop924","_NinjaQueen__","MrAnimGrief","ViRkI_MiLkY","Mc_Scant","Militzi","TickingCowboy_","reddrss1","ySurahxz","MihaiStuVex","maechya","Shiva_GamerzYt","laurenom","cursedmu","Kill0in0skill","j340151","Coconut015","Roden","Zytars","DraketheDuck114","MonkeTime420","swishling","Invinciblefan71","Suvtheory","ManImHigh","Qekyo","iamkeg","Itzelijxh","Tommeke724","Zahar_Cool","SolarSiege","sn1pE__","ElijahSpielt","FTheFireFox9","ZellaMia","TheSpiderSamurai","Smiler927","MaiSaizu","AhoyItsJakub","garajj","rproc0"];
