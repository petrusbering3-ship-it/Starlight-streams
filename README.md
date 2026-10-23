# Starlight Streams

Stream spil fra din gaming PC til en hvilken som helst browser, derhjemme eller ude. Du kan også tænde og slukke PC'en med en knap.

Starlight Streams er bygget på [Moonlight Web](https://github.com/MrCreativ3001/moonlight-web-stream) af MrCreativ3001 (GPL-3.0). Den har alle funktionerne fra Moonlight Web, og derudover:

- **Display 1 / Display 2:** Vælg hvilken skærm du vil streame, direkte på forsiden. Under streamen skifter **Ctrl+Shift+D** mellem dine to skærme.
- **Stream-knappen tænder PC'en:** Er PC'en slukket, bliver den tændt. Når den er klar, starter det spil du spillede sidst.
- **Sluk-knap:** Sluk PC'en fra browseren.
- **Auto-sluk:** PC'en slukker selv, når ingen har streamet i 30 minutter. Den viser først en advarsel på 2 minutter på PC'en.
- **Gæste-link:** Lad en ven spille i nogle timer via et link. Linket udløber af sig selv, og gæster kan ikke slukke din PC.
- **Lydløs derhjemme:** PC'ens højttalere er tavse, mens du streamer. Lyden kommer i fuld styrke på laptoppen.

---

## Guide: fra nul til spil

### Det skal du bruge

| Maskine | Hvad den gør |
|---|---|
| **Gaming PC** (Windows) | Den du spiller *fra*. Den kører Sunshine og Starlights sluk-program. |
| **Server-laptop** (Windows, fx en gammel laptop) | Kører Starlight Streams og sender tænd-signalet. Skal altid være tændt og stå på samme hjemmenetværk som gaming PC'en. |
| **Den du spiller på** | Hvilken som helst computer med en browser (Chrome eller Edge anbefales). Der skal ikke installeres noget. |

Brug netværkskabel til gaming PC'en og helst også til server-laptoppen. Det giver mindst forsinkelse, og tænd-signalet (Wake-on-LAN) virker normalt kun over kabel.

### Trin 1: Hent installationsprogrammerne

Gå til [den nyeste udgivelse](../../releases/latest) og hent:
- `Starlight-Streams-Laptop.zip`
- `Starlight-Streams-PC.zip`

### Trin 2: Installer på server-laptoppen

1. Pak `Starlight-Streams-Laptop.zip` ud, fx på skrivebordet.
2. Dobbeltklik på **`Install.bat`** og tryk **Ja**, når Windows spørger om administrator-adgang.
   Hvis Windows viser "Windows beskyttede din PC", så tryk **Flere oplysninger** og derefter **Kør alligevel**.
3. Svar på spørgsmålene:
   - **Sluk-password:** Find på et password med kun bogstaver og tal, og skriv det ned. Det skal også bruges på gaming PC'en.
   - **Auto-sluk:** Tryk Enter for 30 minutter, eller skriv `0` for aldrig.
4. Installationsprogrammet installerer **Tailscale** (gratis). Log ind med fx din Google-konto, når browseren åbner.
5. Første gang beder Tailscale dig slå **Funnel** til. Åbn linket og tryk **Enable**.
6. Til sidst vises en adresse, der slutter på **`.ts.net`**. Det er din Starlight-adresse, og den virker fra alle browsere i hele verden.

Installationsprogrammet sørger også for, at Starlight starter af sig selv, når laptoppen tænder. Laptoppen går heller ikke i dvale, når den er sat til strøm, heller ikke med låget lukket.

### Trin 3: Installer på gaming PC'en

1. Pak `Starlight-Streams-PC.zip` ud og dobbeltklik på **`Install.bat`**. Tryk **Ja**.
2. Skriv **det samme sluk-password** som på laptoppen.
3. Installationsprogrammet installerer **Sunshine** (programmet der streamer skærmen) og sluk-programmet. Det slår også Wake-on-LAN til i Windows.
4. Skriv den **IP-adresse** ned, der vises til sidst (fx `192.168.1.20`).
5. Åbn **https://localhost:47990** på gaming PC'en og opret et brugernavn og password til Sunshine. Browseren advarer om certifikatet; tryk **Avanceret** og fortsæt.
6. **Genstart gaming PC'en** én gang.

### Trin 4: BIOS-indstillinger (så PC'en kan tændes igen)

Gå ind i BIOS på gaming PC'en (tryk typisk `Del` eller `F2`, mens PC'en starter):
- Slå **Wake on LAN** til. Det kan også hedde "Power On By PCI-E" eller "Resume by LAN".
- Slå **ErP** og **Deep Sleep** fra.

### Trin 5: Første login og parring

1. Åbn din `.ts.net`-adresse (eller `http://localhost:8080` på laptoppen).
2. **Første login opretter din admin-konto.** Det navn og password, du skriver, bliver dit login.
3. Tryk på **tilføj PC** (skærmen med +) og skriv gaming PC'ens IP-adresse fra trin 3.
4. Tryk på PC'en. Der vises en **PIN-kode**.
5. Gå til **https://localhost:47990** på gaming PC'en, vælg **PIN**, skriv koden og tryk **Send**.

Færdig! Tryk på den grønne **▶ Stream** under **Display 1** eller **Display 2**.

---

## Sådan bruger du det

| Det vil du | Sådan gør du |
|---|---|
| Spille | Tryk **▶ Stream** under den skærm, du vil se. Er PC'en slukket, bliver den tændt først. |
| Skifte skærm under spillet | **Ctrl+Shift+D**, eller åbn menuen i venstre side og tryk **1**, **2** … under "Display". |
| Slukke PC'en | **⏻ Power Off** nederst på PC-kortet. |
| Lade en ven spille | **🔗 Guest Link** øverst, vælg antal timer og send linket. |
| Stoppe streamen | Menuen i venstre side, tryk **Exit**. |
| Stoppe en auto-sluk | Skriv `shutdown /a` i Kør (`Win + R`) på gaming PC'en inden for 2 minutter. |
| Have lyd fra PC'en derhjemme også | Indstillinger, slå **Play Audio Local** til. |

---

## Mindst mulig forsinkelse

- **Derhjemme:** Brug `http://<server-laptoppens-ip>:8080` i stedet for `.ts.net`-adressen. Så kører billedet direkte på dit eget netværk (WebRTC). Det er det hurtigste.
- **Ude:** `.ts.net`-adressen virker overalt uden installation, men kører billedet over Web Sockets. Det giver lidt mere forsinkelse.
  Vil du have det hurtigste ude, så installer Tailscale på den computer, du spiller på. Brug laptoppens Tailscale-adresse, fx `http://server-laptop:8080`.
- Brug **netværkskabel** til gaming PC'en og server-laptoppen.
- Under **Indstillinger** kan du sætte fps og bitrate op. **H265** eller **AV1** giver bedre billede, hvis din computer kan afspille det.
- Under streamen viser **Stats** i menuen, hvor forsinkelsen kommer fra.

---

## Fejlfinding

| Problem | Løsning |
|---|---|
| **Stream** siger, at tænd-signalet ikke kunne sendes | PC'en skal være **parret én gang**, mens den er tændt (trin 5). |
| PC'en tænder ikke | Tjek BIOS (trin 4). Gaming PC'en skal bruge **kabel**, og server-laptoppen skal være på samme hjemmenetværk. |
| **Power Off** virker ikke | Sluk-passwordet skal være det samme på begge maskiner. Kør `Install.bat` igen på begge med samme password. |
| Siden kan ikke åbnes | Server-laptoppen skal være tændt. Prøv `http://localhost:8080` på selve laptoppen. |
| `.ts.net`-adressen virker ikke | Kør `Install.bat` igen på laptoppen, og tjek at Funnel er slået til. |
| Forkert skærm | Skærm 1 er den første skærm, Sunshine finder. Tryk **2** i menuen eller Ctrl+Shift+D. |
| Lyd fra PC'en derhjemme | **Play Audio Local** skal være slået fra (det er standard). Virker det stadig ikke, så installer Steam på gaming PC'en. Sunshine bruger Steams virtuelle højttaler til at gøre PC'en lydløs. |

---

## Afinstaller

Hver zip-fil har en **`Uninstall.bat`**. Dobbeltklik på den på den maskine, du vil rydde op på. Sunshine og Tailscale fjernes under **Apps** i Windows-indstillinger.

---

## Avanceret: indstillinger

Server-laptoppens indstillinger ligger i `C:\Program Files\Starlight Streams\server\config.json`. Genstart laptoppen efter ændringer.

```json
{
    "moonlight": {
        "power_agent_token": "MITPASSWORD",
        "power_agent_port": 47900,
        "auto_shutdown_minutes": 30
    },
    "web_server": {
        "bind_address": "0.0.0.0:8080"
    }
}
```

| Indstilling | Betydning |
|---|---|
| `power_agent_token` | Sluk-passwordet. Skal være det samme som på gaming PC'en. |
| `power_agent_port` | Porten sluk-programmet lytter på (standard `47900`). |
| `auto_shutdown_minutes` | Minutter uden stream før PC'en slukkes. `0` = aldrig. |
| `bind_address` | Adressen og porten Starlight kører på (standard `0.0.0.0:8080`). |

Alle Moonlight Webs øvrige indstillinger (https, TURN-server, brugere osv.) virker også. De er beskrevet i [Moonlight Webs README](https://github.com/MrCreativ3001/moonlight-web-stream#config).

---

## Til udviklere: byg selv

Kræver Rust, Node.js og `wasm-bindgen-cli` 0.2.128.

```sh
npm ci
npm run build          # bygger web-delen til ./dist
cargo build --release  # bygger web-server og starlight-power-agent
```

Windows-installationsprogrammerne bygges automatisk af GitHub ved hvert push til `main` (`.github/workflows/windows-installer.yml`) og lægges under Releases.

---

## Licens

GPL-3.0-or-later, ligesom Moonlight Web. Tak til [MrCreativ3001](https://github.com/MrCreativ3001/moonlight-web-stream) og alle Moonlight Webs bidragydere, samt til [Moonlight](https://moonlight-stream.org/) og [Sunshine](https://github.com/LizardByte/Sunshine).
