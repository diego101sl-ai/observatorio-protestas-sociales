/**
 * Detección del país de una protesta a partir del titular.
 *
 * El país del medio (sourcecountry de GDELT) no dice dónde ocurre la protesta:
 * un diario español cubre a Chile, uno indio a Francia. Por eso se busca en el
 * titular (traducción al español y original) el nombre del país, su gentilicio
 * y, con menos peso, ciudades, regiones y referentes muy identificables. Una
 * mención precedida por «en», «in», «desde» suma puntos: «protestas en Tirana»
 * pesa más que «demócratas estadounidenses» en el mismo titular. Si nada
 * aparece, se usa el país del medio.
 *
 * Los textos se normalizan (minúsculas, sin acentos), así que los patrones van
 * en minúsculas y sin tildes. Cada entrada: código ISO 3166-1 alfa-2 (nombre del
 * archivo en img/banderas/), nombre para mostrar, patrón fuerte (país y
 * gentilicios) y patrón débil (ciudades, regiones, referentes).
 */

const TABLA = [
  // América
  ["ar", "Argentina", "argentina|argentin[oa]s?|argentine|argentinian", "buenos aires|caba|conurbano|bonaerenses?|porten[oa]s?|rosario|mendoza|la plata|mar del plata|tucuman|jujuy|neuquen|chubut|santa fe|bahia blanca|santiago del estero|casa rosada|plaza de mayo|milei|kicillof|bullrich"],
  ["bo", "Bolivia", "bolivia|bolivian[oa]s?|bolivian", "cochabamba|santa cruz de la sierra|sucre|evo morales|rodrigo paz"],
  ["br", "Brasil", "brasil|brazil|brasilen[oa]s?|brazilian", "brasilia|sao paulo|san pablo|rio de janeiro|belo horizonte|porto alegre|recife|curitiba|manaos|manaus|lula|bolsonaro"],
  ["ca", "Canadá", "canada|canadienses?|canadian", "ottawa|toronto|montreal|vancouver|quebec|carney"],
  ["cl", "Chile", "chile|chilen[oa]s?|chilean", "santiago|valparaiso|antofagasta|temuco|boric|kast|carabineros|mapuches?"],
  ["co", "Colombia", "colombia|colombian[oa]s?|colombian", "bogota|medellin|cali|barranquilla|cartagena de indias|cucuta|bucaramanga|petro"],
  ["cr", "Costa Rica", "costa rica|costarricenses?|costa rican", ""],
  ["cu", "Cuba", "cuba|cuban[oa]s?|cuban", "la habana|havana|santiago de cuba|diaz[- ]canel"],
  ["do", "República Dominicana", "republica dominicana|dominican republic|dominican[oa]s?|dominican", "santo domingo|abinader"],
  ["ec", "Ecuador", "ecuador|ecuatorian[oa]s?|ecuadorian|ecuadorean", "quito|guayaquil|noboa|conaie"],
  ["sv", "El Salvador", "el salvador|salvadoren[oa]s?|salvadoran", "san salvador|bukele"],
  ["gt", "Guatemala", "guatemala|guatemaltec[oa]s?|guatemalan", "arevalo"],
  ["ht", "Haití", "haiti|haitian[oa]s?|haitian", "puerto principe|port[- ]au[- ]prince"],
  ["hn", "Honduras", "honduras|hondurens?[oa]s?|honduran", "tegucigalpa|san pedro sula"],
  ["jm", "Jamaica", "jamaica|jamaiquin[oa]s?|jamaican", "kingston"],
  ["mx", "México", "mexico|mexican[oa]s?|mexican", "ciudad de mexico|cdmx|oaxaca|chiapas|monterrey|sheinbaum|zocalo"],
  ["ni", "Nicaragua", "nicaragua|nicaraguenses?|nicaraguan", "managua"],
  ["pa", "Panamá", "panama|panamen[oa]s?|panamanian", "mulino"],
  ["py", "Paraguay", "paraguay|paraguay[oa]s?|paraguayan", "asuncion|ciudad del este"],
  ["pe", "Perú", "peru|peruan[oa]s?|peruvian", "lima|cusco|cuzco|arequipa|puno|boluarte"],
  ["pr", "Puerto Rico", "puerto rico|puertorriquen[oa]s?|boricuas?", ""],
  ["tt", "Trinidad y Tobago", "trinidad y tobago|trinidad and tobago", "puerto espana|port of spain"],
  ["us", "Estados Unidos", "estados unidos|ee\\.? ?uu\\.?|united states|u\\.s\\.a?\\.?|estadounidenses?|norteamerican[oa]s?", "washington|nueva york|new york|los angeles|chicago|casa blanca|white house|capitolio|capitol hill|minneapolis|portland|seattle|filadelfia|philadelphia|atlanta|houston|texas|california|florida|trump|pentagono"],
  ["uy", "Uruguay", "uruguay|uruguay[oa]s?|uruguayan", "montevideo"],
  ["ve", "Venezuela", "venezuela|venezolan[oa]s?|venezuelan", "caracas|maracaibo|maduro|chavismo|chavistas?|maria corina machado"],
  ["gf", "Guayana Francesa", "guayana francesa|french guiana", "cayena|cayenne"],
  ["gy", "Guyana", "guyana|guyanes(?:es|a|as)?", "georgetown"],
  ["sr", "Surinam", "surinam|suriname", "paramaribo"],
  ["bz", "Belice", "belice|belize", ""],
  // Europa
  ["es", "España", "espana|spain|espanol(?:es|a|as)?|spanish|spaniards?", "madrid|barcelona|sevilla|bilbao|cataluna|catalonia|catalan(?:es|a|as)?|euskadi|pais vasco|moncloa|puerta del sol|zaragoza|malaga|murcia|canarias"],
  ["pt", "Portugal", "portugal|portugues(?:es|a|as)?|portuguese", "lisboa|lisbon|coimbra"],
  ["fr", "Francia", "francia|france|frances(?:es|a|as)?|french", "paris|marsella|marseille|lyon|estrasburgo|strasbourg|rennes|toulouse|niza|burdeos|bordeaux|lille|nantes|bastia|meaux|macron|eliseo|elysee|lycees?|lyceens?"],
  ["de", "Alemania", "alemania|germany|deutschland|aleman(?:es|a|as)?|german", "berlin|munich|hamburgo|hamburg|frankfurt|dresde|dresden|leipzig|merz|bundestag"],
  ["it", "Italia", "italia|italy|italian[oa]s?|italian", "roma|rome|milan|milano|turin|torino|napoles|naples|napoli|bolonia|bologna|palermo|sicilia|sicily|genova|genoa|florencia|firenze|meloni"],
  ["gb", "Reino Unido", "reino unido|gran bretana|united kingdom|great britain|britain|british|britanic[oa]s?|inglaterra|england|ingles(?:es|a|as)?|escocia|scotland|irlanda del norte|northern ireland", "londres|london|manchester|birmingham|glasgow|edimburgo|edinburgh|belfast|starmer|downing street|westminster|drumcree|orden naranja|orange order|palestin[ae] action"],
  ["ie", "Irlanda", "irlanda|ireland|irlandes(?:es|a|as)?|irish", "dublin"],
  ["nl", "Países Bajos", "paises bajos|holanda|netherlands|holland|dutch|neerlandes(?:es|a|as)?|holandes(?:es|a|as)?", "amsterdam|la haya|the hague|den haag|rotterdam"],
  ["be", "Bélgica", "belgica|belgium|belgas?|belgian", "bruselas|brussels|bruxelles|amberes|antwerp"],
  ["lu", "Luxemburgo", "luxemburgo|luxembourg", ""],
  ["ch", "Suiza", "suiza|switzerland|suiz[oa]s?|swiss", "ginebra|geneva|zurich|berna|bern|lausana|lausanne"],
  ["at", "Austria", "austria|austriac[oa]s?|austrian", "viena|vienna"],
  ["pl", "Polonia", "polonia|poland|polac[oa]s?|polish", "varsovia|warsaw|cracovia|krakow"],
  ["cz", "Chequia", "republica checa|chequia|czech|chec[oa]s?", "praga|prague"],
  ["sk", "Eslovaquia", "eslovaquia|slovakia|eslovac[oa]s?|slovak", "bratislava"],
  ["hu", "Hungría", "hungria|hungary|hungar[oa]s?|hungarian", "budapest|orban"],
  ["ro", "Rumania", "rumania|romania|ruman[oa]s?|romanian", "bucarest|bucharest"],
  ["bg", "Bulgaria", "bulgaria|bulgar[oa]s?|bulgarian", "sofia"],
  ["gr", "Grecia", "grecia|greece|grieg[oa]s?|greek", "atenas|athens|salonica|tesalonica|thessaloniki|komotini|mitsotakis"],
  ["rs", "Serbia", "serbia|serbi[oa]s?|serbian", "belgrado|belgrade|novi sad|vucic"],
  ["hr", "Croacia", "croacia|croatia|croatas?|croatian", "zagreb"],
  ["ba", "Bosnia y Herzegovina", "bosnia|bosni[oa]s?|bosnian", "sarajevo|banja luka|republika srpska"],
  ["me", "Montenegro", "montenegro|montenegrin[oa]s?", "podgorica"],
  ["mk", "Macedonia del Norte", "macedonia del norte|north macedonia|macedonia|macedoni[oa]s?", "skopie|skopje"],
  ["al", "Albania", "albania|alban(?:es|esa|eses|esas)|albanian", "tirana"],
  ["xk", "Kosovo", "kosovo|kosovar(?:es)?", "pristina|prishtina|uck|elk"],
  ["si", "Eslovenia", "eslovenia|slovenia|esloven[oa]s?|slovenian", "liubliana|ljubljana"],
  ["ua", "Ucrania", "ucrania|ukraine|ucranian[oa]s?|ukrainian", "kiev|kyiv|jarkov|kharkiv|odesa|leopolis|lviv|zelenski|zelensky"],
  ["ru", "Rusia", "rusia|russia|rus[oa]s?|russian", "moscu|moscow|san petersburgo|st\\.? petersburg|kremlin|putin"],
  ["by", "Bielorrusia", "bielorrusia|belarus|bielorrus[oa]s?|belarusian", "minsk|lukashenko"],
  ["md", "Moldavia", "moldavia|moldova|moldav[oa]s?|moldovan", "chisinau"],
  ["ge", "Georgia", "georgia|georgian[oa]s?|georgian", "tiflis|tbilisi"],
  ["am", "Armenia", "armenia|armeni[oa]s?|armenian", "erevan|yerevan|pashinyan"],
  ["az", "Azerbaiyán", "azerbaiyan|azerbaijan|azeri(?:es)?|azerbaiyan[oa]s?", "baku"],
  ["tr", "Turquía", "turquia|turkey|turkiye|turc[oa]s?|turkish", "ankara|estambul|istanbul|esmirna|izmir|erdogan|imamoglu"],
  ["lt", "Lituania", "lituania|lithuania|lituan[oa]s?|lithuanian", "vilnius|vilna|kaunas"],
  ["lv", "Letonia", "letonia|latvia|leton(?:es|a|as)?|latvian", "riga"],
  ["ee", "Estonia", "estonia|estoni[oa]s?|estonian", "tallin|tallinn"],
  ["fi", "Finlandia", "finlandia|finland|finlandes(?:es|a|as)?|finnish", "helsinki"],
  ["se", "Suecia", "suecia|sweden|suec[oa]s?|swedish", "estocolmo|stockholm|malmo|gotemburgo|gothenburg"],
  ["no", "Noruega", "noruega|norway|norueg[oa]s?|norwegian", "oslo"],
  ["dk", "Dinamarca", "dinamarca|denmark|danes(?:es|a|as)?|danish", "copenhague|copenhagen"],
  ["is", "Islandia", "islandia|iceland|islandes(?:es|a|as)?", "reikiavik|reykjavik"],
  ["cy", "Chipre", "chipre|cyprus|chipriotas?|cypriot", "nicosia"],
  ["mt", "Malta", "malta|maltes(?:es|a|as)?", "la valeta|valletta"],
  ["va", "Vaticano", "vaticano|vatican", ""],
  ["eu", "Unión Europea", "union europea|european union", "parlamento europeo|european parliament|eurocamara|comision europea|european commission"],
  // Medio Oriente y norte de África
  ["il", "Israel", "israel|israeli(?:es)?|israelitas?", "tel aviv|jerusalen|jerusalem|haifa|netanyahu|knesset"],
  ["ps", "Palestina", "palestina|palestine|palestin[oa]s?|palestinian", "gaza|cisjordania|west bank|ramala|ramallah|nablus|yenin|jenin|hebron"],
  ["ir", "Irán", "iran(?! al? )|irani(?:es)?|iranian", "teheran|tehran|isfahan|mashhad|jamenei|khamenei"],
  ["iq", "Irak", "irak|iraq|iraqui(?:es)?|iraqi", "bagdad|baghdad|basora|basra|erbil|mosul"],
  ["sy", "Siria", "siria|syria|siri[oa]s?|syrian", "damasco|damascus|alepo|aleppo|suweida|sweida|latakia|idlib"],
  ["lb", "Líbano", "libano|lebanon|libanes(?:es|a|as)?|lebanese", "beirut|tripoli del libano"],
  ["jo", "Jordania", "jordania|jordan(?! bardella)|jordan[oa]s?|jordanian", "amman"],
  ["sa", "Arabia Saudita", "arabia saudita|arabia saudi|saudi arabia|saudi(?:es|ta|tas)?", "riad|riyadh|la meca|mecca|yeda|jeddah"],
  ["ye", "Yemen", "yemen|yemeni(?:es)?|yemenita?s?", "sanaa|aden|hutis|houthis"],
  ["ae", "Emiratos Árabes Unidos", "emiratos arabes unidos|emiratos arabes|emiratos|united arab emirates|emirati(?:es)?", "dubai|abu dabi|abu dhabi"],
  ["qa", "Catar", "qatar|catar|catari(?:es)?|qatari", "doha"],
  ["kw", "Kuwait", "kuwait|kuwaiti(?:es)?", ""],
  ["bh", "Baréin", "barein|bahrein|bahrain|bareini(?:es)?", "manama"],
  ["om", "Omán", "oman|omani(?:es)?", "mascate|muscat"],
  ["eg", "Egipto", "egipto|egypt|egipci[oa]s?|egyptian", "el cairo|cairo|alejandria|alexandria|al sisi"],
  ["ma", "Marruecos", "marruecos|morocco|marroqui(?:es)?|moroccan", "rabat|casablanca|tanger|tangier|marrakech|fez|agadir|genz? ?212"],
  ["eh", "Sahara Occidental", "sahara occidental|western sahara|saharauis?", "el aaiun|laayoune"],
  ["dz", "Argelia", "argelia|algeria|argelin[oa]s?|algerian", "argel|algiers|cabilia|kabylie"],
  ["tn", "Túnez", "tunez|tunisia|tunecin[oa]s?|tunisian", "sfax|gabes"],
  ["ly", "Libia", "libia|libya|libi[oa]s?|libyan", "tripoli|bengasi|benghazi"],
  // África subsahariana
  ["sd", "Sudán", "sudan|sudanes(?:es|a|as)?|sudanese", "jartum|khartoum|darfur|el fasher"],
  ["ss", "Sudán del Sur", "sudan del sur|south sudan|sursudanes(?:es|a|as)?|south sudanese", "yuba|juba"],
  ["et", "Etiopía", "etiopia|ethiopia|etiopes?|ethiopian", "adis abeba|addis ababa|tigray|amhara|oromia"],
  ["er", "Eritrea", "eritrea|eritre[oa]s?", "asmara"],
  ["so", "Somalia", "somalia|somali(?:es)?", "mogadiscio|mogadishu"],
  ["dj", "Yibuti", "yibuti|djibouti", ""],
  ["ke", "Kenia", "kenia|kenya|kenian[oa]s?|kenyan", "nairobi|mombasa|kisumu|ruto"],
  ["ug", "Uganda", "uganda|ugandes(?:es|a|as)?|ugandan", "kampala|museveni"],
  ["tz", "Tanzania", "tanzania|tanzan[oa]s?|tanzanian", "dar es salaam|dodoma|zanzibar"],
  ["rw", "Ruanda", "ruanda|rwanda|ruandes(?:es|a|as)?|rwandan", "kigali"],
  ["bi", "Burundi", "burundi|burundes(?:es|a|as)?", "buyumbura|bujumbura|gitega"],
  ["cd", "RD del Congo", "republica democratica del congo|rd congo|rdc|drc|congo|congoles(?:es|a|as)?|congolese", "kinshasa|kivu|bukavu|lubumbashi"],
  ["cg", "Congo-Brazzaville", "congo-brazzaville", "brazzaville"],
  ["cm", "Camerún", "camerun|cameroon|camerunes(?:es|a|as)?|cameroonian", "yaunde|yaounde|duala|douala|biya"],
  ["ng", "Nigeria", "nigeria|nigerian[oa]s?|nigerian", "abuya|abuja|kano|kaduna|port harcourt|tinubu"],
  ["gh", "Ghana", "ghana|ghanes(?:es|a|as)?|ghanaian", "acra|accra|kumasi"],
  ["ci", "Costa de Marfil", "costa de marfil|ivory coast|cote d'ivoire|marfilen[oa]s?|ivorian", "abiyan|abidjan|yamusukro|yamoussoukro|ouattara"],
  ["sn", "Senegal", "senegal|senegales(?:es|a|as)?|senegalese", "dakar"],
  ["ml", "Malí", "mali|malienses?|malian", "bamako|tombuctu|timbuktu"],
  ["bf", "Burkina Faso", "burkina faso|burkina|burkines(?:es|a|as)?|burkinabe", "uagadugu|ouagadougou"],
  ["ne", "Níger", "niger|nigerin[oa]s?|nigerien", "niamey"],
  ["td", "Chad", "chad|chadian[oa]s?|chadian", "yamena|ndjamena"],
  ["gn", "Guinea", "guinea|guinean[oa]s?", "conakry"],
  ["gw", "Guinea-Bisáu", "guinea[- ]bis[as]a?u", "bissau"],
  ["gq", "Guinea Ecuatorial", "guinea ecuatorial|equatorial guinea|ecuatoguinean[oa]s?", "malabo"],
  ["sl", "Sierra Leona", "sierra leona|sierra leone", "freetown"],
  ["lr", "Liberia", "liberia|liberian[oa]s?", "monrovia"],
  ["tg", "Togo", "togo|togoles(?:es|a|as)?|togolese", "lome"],
  ["bj", "Benín", "benin|benines(?:es|a|as)?", "cotonu|cotonou|porto novo"],
  ["ga", "Gabón", "gabon|gabones(?:es|a|as)?", "libreville"],
  ["cf", "República Centroafricana", "republica centroafricana|central african republic", "bangui"],
  ["ao", "Angola", "angola|angolen[oa]s?|angolan", "luanda"],
  ["mz", "Mozambique", "mozambique|mozambiquen[oa]s?|mozambican", "maputo|beira|nampula"],
  ["zw", "Zimbabue", "zimbabue|zimbabwe|zimbabuenses?|zimbabwean", "harare|bulawayo|mnangagwa"],
  ["zm", "Zambia", "zambia|zambian[oa]s?", "lusaka"],
  ["mw", "Malaui", "malaui|malawi|malauies", "lilongwe|blantyre"],
  ["mg", "Madagascar", "madagascar|malgaches?|malagasy", "antananarivo"],
  ["za", "Sudáfrica", "sudafrica|south africa|sudafrican[oa]s?|south african", "johannesburgo|johannesburg|ciudad del cabo|cape town|pretoria|durban|soweto|ramaphosa"],
  ["na", "Namibia", "namibia|namibi[oa]s?", "windhoek"],
  ["bw", "Botsuana", "botsuana|botswana", "gaborone"],
  ["ls", "Lesoto", "lesoto|lesotho", "maseru"],
  ["sz", "Esuatini", "esuatini|eswatini|suazilandia|swaziland", "mbabane"],
  ["mr", "Mauritania", "mauritania|mauritan[oa]s?", "nuakchot|nouakchott"],
  ["mu", "Mauricio", "isla mauricio|mauritius", "port louis"],
  ["cv", "Cabo Verde", "cabo verde|cape verde", ""],
  ["km", "Comoras", "comoras|comoros", "moroni"],
  // Asia y Pacífico
  ["in", "India", "india|indian", "nueva delhi|new delhi|delhi|bombay|mumbai|calcuta|kolkata|chennai|bangalore|bengaluru|hyderabad|cachemira|kashmir|manipur|kerala|bihar|bengala occidental|west bengal|ladakh|jantar mantar|modi"],
  ["pk", "Pakistán", "pakistan|paquistan|pakistani(?:es)?|paquistani(?:es)?", "islamabad|karachi|lahore|rawalpindi|peshawar|baluchistan|balochistan|imran khan"],
  ["bd", "Bangladés", "banglades|bangladesh|bangladesi(?:es)?|bangladeshi", "daca|dhaka|chittagong|hasina"],
  ["lk", "Sri Lanka", "sri lanka|ceilan|esrilanques(?:es|a|as)?|sri lankan", "colombo"],
  ["np", "Nepal", "nepal|nepali(?:es)?|nepales(?:es|a|as)?|nepalese", "katmandu|kathmandu"],
  ["bt", "Bután", "butan|bhutan", "timbu|thimphu"],
  ["mv", "Maldivas", "maldivas|maldives", ""],
  ["af", "Afganistán", "afganistan|afghanistan|afgan[oa]s?|afghan", "kabul|kandahar|herat"],
  ["mm", "Myanmar", "myanmar|birmania|burma|birman[oa]s?|burmese", "rangun|yangon|naipyido|naypyidaw|mandalay"],
  ["th", "Tailandia", "tailandia|thailand|tailandes(?:es|a|as)?|thai", "bangkok|chiang mai"],
  ["vn", "Vietnam", "vietnam|vietnamitas?|vietnamese", "hanoi|ho chi minh|saigon|da nang"],
  ["kh", "Camboya", "camboya|cambodia|camboyan[oa]s?|cambodian", "nom pen|phnom penh|hun sen|hun manet"],
  ["la", "Laos", "laos|laosian[oa]s?|lao", "vientian|vientiane"],
  ["my", "Malasia", "malasia|malaysia|malasi[oa]s?|malaysian", "kuala lumpur|penang"],
  ["sg", "Singapur", "singapur|singapore", ""],
  ["id", "Indonesia", "indonesia|indonesi[oa]s?|indonesian", "yakarta|jakarta|bali|java|sumatra|surabaya|bandung|papua|prabowo"],
  ["ph", "Filipinas", "filipinas|philippines|filipin[oa]s?|filipino", "manila|cebu|davao|mindanao"],
  ["cn", "China", "china|chin[oa]s?|chinese", "pekin|beijing|shanghai|shenzhen|wuhan|guangzhou|xinjiang|uigur(?:es)?|uyghur|tibet|tibetan[oa]s?|xi jinping"],
  ["hk", "Hong Kong", "hong kong|hongkones(?:es|a|as)?", ""],
  ["tw", "Taiwán", "taiwan|taiwanes(?:es|a|as)?|taiwanese", "taipei"],
  ["jp", "Japón", "japon|japan|japones(?:es|a|as)?|japanese", "tokio|tokyo|osaka|okinawa|kioto|kyoto"],
  ["kr", "Corea del Sur", "corea del sur|south korea|surcorean[oa]s?|south korean|corean[oa]s?|korean|corea|korea", "seul|seoul|busan|samsung|hyundai"],
  ["kp", "Corea del Norte", "corea del norte|north korea|norcorean[oa]s?|north korean", "pyongyang|kim jong"],
  ["mn", "Mongolia", "mongolia|mongol(?:es|a|as)?|mongolian", "ulan bator|ulaanbaatar"],
  ["kz", "Kazajistán", "kazajistan|kazajstan|kazakhstan|kazaj[oa]s?|kazakh", "astana|almaty"],
  ["kg", "Kirguistán", "kirguistan|kyrgyzstan|kirguis|kyrgyz", "biskek|bishkek"],
  ["uz", "Uzbekistán", "uzbekistan|uzbek[oa]s?", "taskent|tashkent"],
  ["tj", "Tayikistán", "tayikistan|tajikistan|tayik[oa]s?", "dusambe|dushanbe"],
  ["tm", "Turkmenistán", "turkmenistan|turkmen[oa]s?", "asjabad|ashgabat"],
  ["au", "Australia", "australia|australian[oa]s?|australian", "sidney|sydney|melbourne|canberra|brisbane|perth|adelaida|adelaide"],
  ["nz", "Nueva Zelanda", "nueva zelanda|new zealand|neozelandes(?:es|a|as)?", "auckland|maori(?:es)?"],
  ["pg", "Papúa Nueva Guinea", "papua nueva guinea|papua new guinea", "port moresby"],
  ["fj", "Fiyi", "fiyi|fiji", "suva"],
  ["nc", "Nueva Caledonia", "nueva caledonia|new caledonia", "numea|noumea|canac(?:os|a|as)?|kanaks?"],
  ["pf", "Polinesia Francesa", "polinesia francesa|french polynesia", "tahiti|papeete"],
];

const normalizar = (s) => String(s || "")
  .normalize("NFD")
  .replace(/[̀-ͯ]/g, "")
  .toLowerCase()
  .replace(/[’`´]/g, "'");

const PESO_FUERTE = 3;
const PESO_DEBIL = 2;
const BONUS_LUGAR = 2;
// «protestas en Francia», «schools in France», «desde Lima»: la preposición de
// lugar delante de la mención es la mejor pista de dónde ocurre el hecho.
const RE_PREPOSICION = /(?:^|[^a-z])(?:en|desde|hacia|in|at|across|dans|nach|em)\s+(?:(?:el|la|los|las|the|toda|todo|all|le|les|des|o|os|as)\s+)?$/;

// Sin lookbehind (Safari viejos): el límite izquierdo se captura en el grupo 1.
const compilar = (alt) => new RegExp(`(^|[^a-z0-9])(?:${alt})(?![a-z0-9])`, "g");
const PAISES = TABLA.map(([cc, nombre, fuerte, debil]) => ({
  cc,
  nombre,
  patrones: [[compilar(fuerte), PESO_FUERTE], ...(debil ? [[compilar(debil), PESO_DEBIL]] : [])],
}));

/**
 * País más probable mencionado en un texto, o null.
 * Devuelve { cc, nombre, puntaje }.
 *
 * Se juntan todas las menciones y, cuando dos se solapan («Corea» dentro de
 * «Corea del Norte», «Guinea» dentro de «Papúa Nueva Guinea»), gana la más
 * larga. Después cada país se queda con su mejor mención.
 */
export function paisDeTexto(texto) {
  const t = normalizar(texto);
  if (!t) return null;
  const menciones = [];
  for (const p of PAISES) {
    for (const [re, peso] of p.patrones) {
      re.lastIndex = 0;
      for (const m of t.matchAll(re)) {
        const ini = m.index + m[1].length;
        const antes = t.slice(Math.max(0, ini - 14), ini);
        const conPrep = RE_PREPOSICION.test(antes);
        menciones.push({ p, ini, fin: m.index + m[0].length, conPrep, valor: peso + (conPrep ? BONUS_LUGAR : 0) });
      }
    }
  }
  if (!menciones.length) return null;
  menciones.sort((a, b) => (b.fin - b.ini) - (a.fin - a.ini) || a.ini - b.ini);
  const ocupado = [];
  const porPais = new Map();
  for (const m of menciones) {
    if (ocupado.some((o) => m.ini < o.fin && o.ini < m.fin)) continue;
    ocupado.push(m);
    const acum = porPais.get(m.p) || { puntaje: 0, pos: Infinity, conPrep: false };
    acum.puntaje = Math.max(acum.puntaje, m.valor);
    acum.conPrep = acum.conPrep || m.conPrep;
    acum.pos = Math.min(acum.pos, m.ini);
    porPais.set(m.p, acum);
  }
  // Si hay menciones con preposición de lugar, gana la primera del titular
  // (lo que sigue suele ser contexto: «…derrotar a Trump en Estados Unidos»).
  // Si no hay ninguna, gana el mayor puntaje y, a igualdad, la primera.
  let mejor = null;
  for (const [p, { puntaje, pos, conPrep }] of porPais) {
    const gana = !mejor
      || (conPrep && !mejor.conPrep)
      || (conPrep === mejor.conPrep && (conPrep ? pos < mejor.pos : (puntaje > mejor.puntaje || (puntaje === mejor.puntaje && pos < mejor.pos))));
    if (gana) mejor = { cc: p.cc, nombre: p.nombre, puntaje, pos, conPrep };
  }
  return { cc: mejor.cc, nombre: mejor.nombre, puntaje: mejor.puntaje };
}

/**
 * País de la protesta de un artículo: primero el titular (traducido y original),
 * si no hay ninguna mención, el país del medio.
 */
// Muchos titulares terminan con el nombre del medio («… – The Irish News»,
// «… | MigNews - Noticias de Israel»): ese sufijo corto se analiza solo si el
// resto del titular no menciona ningún lugar.
function separarMedio(titulo) {
  const m = String(titulo || "").match(/^(.*\S)\s+(?:\||–|—|::|-)\s+([^|–—:]{3,45})$/);
  return m ? [m[1], m[2]] : [String(titulo || ""), ""];
}

export function paisDeArticulo({ tituloEs = "", titulo = "", paisFuente = "" } = {}) {
  const [cuerpoEs, medioEs] = separarMedio(tituloEs);
  const [cuerpo, medio] = separarMedio(titulo && titulo !== tituloEs ? titulo : "");
  const porTitulo = paisDeTexto([cuerpoEs, cuerpo].filter(Boolean).join(" · "))
    || paisDeTexto([medioEs, medio].filter(Boolean).join(" · "));
  if (porTitulo) return { ...porTitulo, origen: "titulo" };
  const porFuente = paisDeTexto(paisFuente);
  return porFuente ? { ...porFuente, origen: "fuente" } : null;
}

/** Ruta de la bandera (SVG 4:3 de flag-icons, en img/banderas/). */
export function rutaBandera(cc) {
  return `img/banderas/${cc}.svg`;
}
