<template>
  <el-dropdown trigger="click" @command="onCommand">
    <div class="user-menu-trigger">
      <el-avatar :size="32" class="user-avatar">
        {{ userStore.userInfo?.username?.charAt(0).toUpperCase() }}
      </el-avatar>
      <span class="user-name">{{ userStore.userInfo?.username }}</span>
      <el-icon><ArrowDown /></el-icon>
    </div>
    <template #dropdown>
      <el-dropdown-menu>
        <el-dropdown-item command="dashboard">
          <el-icon><User /></el-icon>
          {{ t('home.userCenter') }}
        </el-dropdown-item>
        <el-dropdown-item v-if="props.showHome" command="home">
          <el-icon><House /></el-icon>
          {{ t('home.title') }}
        </el-dropdown-item>
        <el-dropdown-item command="changePassword">
          <el-icon><Lock /></el-icon>
          {{ t('account.password.title') }}
        </el-dropdown-item>
        <el-dropdown-item command="logout" divided>
          <el-icon><SwitchButton /></el-icon>
          {{ t('home.logout') }}
        </el-dropdown-item>
      </el-dropdown-menu>
    </template>
  </el-dropdown>

  <!-- 修改密码弹窗（自包含：改密成功后 bump 会话纪元全端下线，引导重新登录） -->
  <el-dialog v-model="pwVisible" :title="t('account.password.title')" width="min(420px, 92vw)">
    <el-form label-width="90px" @submit.prevent>
      <el-form-item :label="t('account.password.oldPassword')">
        <el-input v-model="pwForm.oldPassword" type="password" show-password :placeholder="t('account.password.oldPlaceholder')" />
      </el-form-item>
      <el-form-item :label="t('account.password.newPassword')">
        <el-input v-model="pwForm.newPassword" type="password" show-password :placeholder="t('account.password.newPlaceholder')" />
      </el-form-item>
      <el-form-item :label="t('account.password.confirmPassword')">
        <el-input v-model="pwForm.confirmPassword" type="password" show-password :placeholder="t('account.password.confirmPlaceholder')" @keyup.enter="submitPassword" />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button @click="pwVisible = false">{{ t('common.cancel') }}</el-button>
      <el-button type="primary" :loading="pwSubmitting" @click="submitPassword">{{ t('account.password.submit') }}</el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { reactive, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { ElMessage } from 'element-plus'
import { ArrowDown, User, SwitchButton, House, Lock } from '@element-plus/icons-vue'
import { userApi } from '@/api/user'
import { translateError } from '@/utils/api-interceptor'
import { useUserStore } from '@/stores/user'

/** 顶栏用户菜单：导航行为由父级按 command 自行处理（home 登出不跳转、AppLayout 登出回首页，语义不同）；
 * changePassword 由本组件自处理（弹窗），成功后发 logout command 复用父级登出流程 */
const props = withDefaults(defineProps<{ showHome?: boolean }>(), { showHome: false })
const emit = defineEmits<{ command: [key: string] }>()

const userStore = useUserStore()
const { t } = useI18n()

const pwVisible = ref(false)
const pwSubmitting = ref(false)
const pwForm = reactive({ oldPassword: '', newPassword: '', confirmPassword: '' })

const onCommand = (key: string) => {
  if (key === 'changePassword') {
    pwForm.oldPassword = ''
    pwForm.newPassword = ''
    pwForm.confirmPassword = ''
    pwVisible.value = true
    return
  }
  emit('command', key)
}

const submitPassword = async () => {
  if (pwSubmitting.value) return
  if (!pwForm.oldPassword || !pwForm.newPassword || !pwForm.confirmPassword) {
    ElMessage.warning(t('account.password.required'))
    return
  }
  if (pwForm.newPassword.length < 6) {
    ElMessage.warning(t('account.password.tooShort'))
    return
  }
  if (pwForm.newPassword !== pwForm.confirmPassword) {
    ElMessage.warning(t('account.password.mismatch'))
    return
  }
  pwSubmitting.value = true
  try {
    const res = await userApi.changePassword({
      old_password: pwForm.oldPassword,
      new_password: pwForm.newPassword,
    })
    if (res.code === 200 || res.code === 0) {
      pwVisible.value = false
      ElMessage.success(t('account.password.success'))
      // 后端已 bump 会话纪元（本端令牌同样失效），走父级登出流程回登录页
      emit('command', 'logout')
    } else {
      const tr = translateError(res)
      ElMessage.error(tr.i18nKey ? t(tr.i18nKey) : tr.fallback || t('common.failed'))
    }
  } catch (e: unknown) {
    const tr = translateError(e)
    ElMessage.error(tr.i18nKey ? t(tr.i18nKey) : tr.fallback || t('common.failed'))
  } finally {
    pwSubmitting.value = false
  }
}
</script>

<style scoped>
.user-menu-trigger {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  padding: var(--spacing-xs) var(--spacing-sm) var(--spacing-xs) var(--spacing-xs);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: background-color 0.15s ease;
}

.user-menu-trigger:hover {
  background: var(--color-muted);
}

.user-avatar {
  background: var(--primary-color);
  color: #fff;
  font-weight: 600;
  font-size: var(--text-xs);
}

.user-name {
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--color-text-primary);
}

@media (max-width: 768px) {
  .user-name {
    display: none;
  }
}
</style>
