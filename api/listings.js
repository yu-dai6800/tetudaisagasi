// てつだいさがし — Airtableの「募集」を読み取って公開用JSONを返す窓口（Vercel Serverless Function）
// 鍵(AIRTABLE_TOKEN)はVercelの環境変数にだけ置く。ブラウザには出さない。
// 返すのは募集の公開情報だけ。サポーターの本名・連絡先などの個人情報は一切返さない。

function dateLabel(iso){
  if(!iso) return '';
  const d = new Date(iso);
  if(isNaN(d)) return iso;
  const w = ['日','月','火','水','木','金','土'][d.getDay()];
  return `${d.getMonth()+1}/${d.getDate()}(${w})`;
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
      // 「公開しない」状態の募集はサイトに出さない（任意運用）
      return {
        id:    rec.id,
        title: f['タイトル'] || '無題の募集',
        who:   (Array.isArray(f['ホスト名']) ? f['ホスト名'][0] : f['ホスト名']) || '',
        date:  f['日付'] || '',
        when:  `${dateLabel(f['日付'])} ${f['時間'] || ''}`.trim(),
        cap:   f['定員'] || 0,
        applied: (f['応募数'] != null ? f['応募数'] : null),
        capStatusText: f['募集状況'] || '',
        deadline: f['募集期限'] || '',
        status: f['状態'] || '',
        reward: f['お礼'] || '',
        detail: f['内容'] || '',
        bring:  f['持ち物'] || '',
        img:    f['画像URL'] || '',
        tag,
        tagc:   (tag === '農家' || tag === '地域活動') ? 'green' : '',
        bg:     '#f0e3d0',
        ava:    '🏠'
      };
    })
    // 「終了」や「非公開」を隠したい場合の例（必要に応じて調整）
    .filter(l => l.status !== '非公開');

    // 60秒キャッシュ（Airtableへの問い合わせを減らす）
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    res.status(200).json({ listings });
  }catch(e){
    res.status(500).json({error:'サーバーエラー', detail:String(e)});
  }
}
