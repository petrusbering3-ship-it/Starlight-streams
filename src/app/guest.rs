//! Starlight Streams: temporary guest users that can be shared as a link.
//!
//! The expiry is stored inside the user name (`guest-<unix expiry>-<random>`),
//! so no storage changes are needed and guests are removed even after a restart.

use std::time::{Duration, SystemTime, UNIX_EPOCH};

use moonlight_common::{crypto::rustcrypto::RustCryptoBackend, http::pair::PairingCryptoBackend};

use crate::app::{
    App, AppError, AppInner,
    password::StoragePassword,
    role::RoleId,
    storage::{
        Either, StorageHostModify, StorageQueryHosts, StorageRoleAdd, StorageRoleDefaultSettings,
        StorageRolePermissions, StorageUserAdd,
    },
    user::{Admin, RoleType},
};

const GUEST_PREFIX: &str = "guest-";
const GUEST_ROLE_NAME: &str = "Guest";
const MAX_GUEST_HOURS: u32 = 24 * 7;

pub struct GuestLogin {
    pub name: String,
    pub password: String,
    pub expires_at: u64,
}

fn now_unix() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or(Duration::ZERO)
        .as_secs()
}

fn random_hex(bytes: usize) -> Result<String, AppError> {
    let mut random = vec![0; bytes];
    RustCryptoBackend.random_bytes(&mut random)?;
    Ok(hex::encode(random))
}

/// Returns the expiry if this is the name of a guest user
pub fn guest_expiry(name: &str) -> Option<u64> {
    name.strip_prefix(GUEST_PREFIX)?
        .split('-')
        .next()?
        .parse()
        .ok()
}

impl App {
    pub async fn create_guest(&self, admin: &Admin, hours: u32) -> Result<GuestLogin, AppError> {
        if hours == 0 || hours > MAX_GUEST_HOURS {
            return Err(AppError::BadRequest);
        }

        let storage = &self.inner.storage;

        let role_id = self.guest_role().await?;

        let expires_at = now_unix() + hours as u64 * 60 * 60;
        let name = format!("{GUEST_PREFIX}{expires_at}-{}", random_hex(3)?);
        let password = random_hex(16)?;

        // Use the same client id as the admin, so the host sees the same paired client
        let admin_user = storage.get_user(admin.id()).await?;

        self.add_user(
            admin,
            StorageUserAdd {
                name: name.clone(),
                password: Some(StoragePassword::new(&password)?),
                role_id,
                client_unique_id: admin_user.client_unique_id,
            },
        )
        .await?;

        // Guests can only see global hosts -> share the admins hosts
        let hosts = storage
            .list_user_hosts(StorageQueryHosts {
                user_id: admin.id(),
            })
            .await?;
        for (host_id, _) in hosts {
            storage
                .modify_host(
                    host_id,
                    StorageHostModify {
                        owner: Some(None),
                        ..Default::default()
                    },
                )
                .await?;
        }

        Ok(GuestLogin {
            name,
            password,
            expires_at,
        })
    }

    async fn guest_role(&self) -> Result<RoleId, AppError> {
        let storage = &self.inner.storage;

        let roles = match storage.list_roles().await? {
            Either::Left(role_ids) => {
                let mut roles = Vec::new();
                for role_id in role_ids {
                    roles.push(storage.get_role(role_id).await?);
                }
                roles
            }
            Either::Right(roles) => roles,
        };

        if let Some(role) = roles
            .iter()
            .find(|role| role.name == GUEST_ROLE_NAME && role.ty == RoleType::User)
        {
            return Ok(role.id);
        }

        let role = storage
            .add_role(StorageRoleAdd {
                name: GUEST_ROLE_NAME.to_string(),
                ty: RoleType::User,
                default_settings: StorageRoleDefaultSettings::default(),
                permissions: StorageRolePermissions {
                    allow_add_hosts: false,
                    ..Default::default()
                },
            })
            .await?;

        Ok(role.id)
    }
}

pub(super) async fn remove_expired_guests(app: &AppInner) -> Result<(), AppError> {
    let now = now_unix();

    let users = match app.storage.list_users().await? {
        Either::Left(user_ids) => {
            let mut users = Vec::new();
            for user_id in user_ids {
                users.push(app.storage.get_user(user_id).await?);
            }
            users
        }
        Either::Right(users) => users,
    };

    for user in users {
        if guest_expiry(&user.name).is_some_and(|expiry| expiry <= now) {
            app.storage.remove_all_user_session_tokens(user.id).await?;
            app.storage.remove_user(user.id).await?;
        }
    }

    Ok(())
}
