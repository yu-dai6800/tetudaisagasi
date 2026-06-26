/ てつだいさがし — Airtableの「募集」を読み取って公開用JSONを返す窓口（Vercel Serverless Function）
// 鍵(AIRTABLE_TOKEN)はVercelの環境変数にだけ置く。ブラウザには出さない。
// 返すのは募集の公開情報だけ。サポーターの本名・連絡先などの個人情報は一切返さない。

// 日本時間(JST)で日付を扱う。{ymd:'2026-06-29', label:'6/29(月)'} を返す
function jstDate(iso){
  if(!iso) return {ymd:'', label:''};
  const d = new Date(iso);
  if(isNaN(d)) return {ymd:String(iso), label:String(iso)};
  const ymd = new Intl.DateTimeFormat('en-CA', {timeZone:'Asia/Tokyo'}).format(d); // 2026-06-29
  const wd  = new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo', weekday:'short'}).format(d);
  const [, m, da] = ymd.split('-');
  return {ymd, label:`${+m}/${+da}(${wd})`};
}

export default async function handler(req, res){
  const token  = process.env.AIRTABLE_TOKEN;                 // 必須・読み取り専用トークン
  const baseId = process.env.AIRTABLE_BASE || 'appkqwkVrbW3A965j';
  const table  = process.env.AIRTABLE_TABLE || '募集';        // テーブル名（タブ名）

  if(!token){
    res.status(500).json({error:'AIRTABLE_TOKEN が未設定です。Vercelの環境変数に登録してください。'});
    return;
  }

  try{
    const url = `https://api.airtable.com/v0/${baseId}/${encodeURIComponent(table)}?pageSize=100`;
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if(!r.ok){
      const detail = await r.text();
      res.status(r.status).json({error:'Airtableの読み取りに失敗しました', detail});
      return;
    }
    const data = await r.json();

    const listings = (data.records || []).map(rec => {
      const f = rec.fields || {};
      const tag = f['種別'] || 'お店';
      const dj = jstDate(f['日付']);
      return {
        id:    rec.id,
        title: f['タイトル'] || '無題の募集',
        who:   (Array.isArray(f['ホスト名']) ? f['ホスト名'][0] : f['ホスト名']) || '',
        place: f['場所'] || '',
        date:  dj.ymd,
        when:  `${dj.label} ${f['時間'] || ''}`.trim(),
        cap:   f['定員'] || 0,
        applied: (f['応募数'] != null ? f['応募数'] : null),
        capStatusText: f['募集状況'] || '',
        deadline: jstDate(f['募集期限']).ymd,
        status: f['状態'] || '',
        reward: f['お礼'] || '',
        detail: f['内容'] || '',
        bring:  f['持ち物'] || '',
        img:    f['画像URL'] || '',
        imgPos: f['画像位置'] || '',
        tag,
        tagc:   (tag === '農家' || tag === '地域活動') ? 'green' : '',
        bg:     '#f0e3d0',
        ava:    '🏠'
      };
    })
    // 「非公開」や、日付の無い空行（誤って増えた行など）はサイトに出さない
    .filter(l => l.status !== '非公開' && l.date);

    // 60秒キャッシュ（Airtableへの問い合わせを減らす）
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json({ listings });
  }catch(e){
    res.status(500).json({error:'サーバーエラー', detail:String(e)});
  }
}
