async function test() {
  const url = "https://anrgvpowpwncyneqxlcm.supabase.co/rest/v1/certificates?select=*";
  const apiKey = "sb_publishable_SLyd0_gva4JPX8FJdP2fBA_wQPN0aaS";

  const res = await fetch(url, {
    headers: {
      "apikey": apiKey,
      "Authorization": `Bearer ${apiKey}`
    }
  });

  const data = await res.json();
  console.log("Status:", res.status);
  console.log("Response:", data);
}

test();
