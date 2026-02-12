
const url = "https://zrerpexdsaxqztqqrwwv.supabase.co/rest/v1/recipes?limit=1";
const apikey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InpyZXJwZXhkc2F4cXp0cXFyd3d2Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0OTM2MDM5OCwiZXhwIjoyMDY0OTM2Mzk4fQ.t_EEN1j29ofXe20utLIV2GTzpEfu0dK8IZ9ZrrNU39Q";

async function run() {
    const res = await fetch(url, {
        headers: {
            "apikey": apikey,
            "Authorization": "Bearer " + apikey
        }
    });
    const json = await res.json();
    console.log("All Columns:", JSON.stringify(Object.keys(json[0] || {}), null, 2));
}
run();
