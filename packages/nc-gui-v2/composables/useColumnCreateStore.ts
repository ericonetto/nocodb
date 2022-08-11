import { createInjectionState } from '@vueuse/core'
import { Form, notification } from 'ant-design-vue'
import type { ColumnType, TableType } from 'nocodb-sdk'
import { UITypes } from 'nocodb-sdk'
import type { Ref } from 'vue'
import { useColumn } from './useColumn'
import { computed } from '#imports'
import { useNuxtApp } from '#app'
import { extractSdkResponseErrorMsg } from '~/utils/errorUtils'

const useForm = Form.useForm

// enum ColumnAlterType {
//   NEW=4,
//   EDIT=2,
//   RENAME=8,
//   DELETE=0,
// }

const columnToValidate = [UITypes.Email, UITypes.URL, UITypes.PhoneNumber]

const [useProvideColumnCreateStore, useColumnCreateStore] = createInjectionState(
  (meta: Ref<TableType>, column?: Ref<ColumnType>) => {
    const { sqlUi } = useProject()
    const { $api } = useNuxtApp()
    const { getMeta } = useMetas()

    const idType = null

    // state
    // todo: give proper type - ColumnType
    const formState = ref<Record<string, any>>({
      title: 'title',
      uidt: UITypes.SingleLineText,
      ...(column?.value || {}),
      meta: column?.value?.meta || {},
    })

    const additionalValidations = ref<Record<string, any>>({})

    const validators = computed(() => {
      return {
        title: [
          {
            required: true,
            message: 'Column name is required',
          },
          // validation for unique column name
          {
            validator: (rule: any, value: any) => {
              return new Promise<void>((resolve, reject) => {
                if (
                  meta.value?.columns?.some(
                    (c) =>
                      c.id !== formState.value.id && // ignore current column
                      // compare against column_name and title
                      ((value || '').toLowerCase() === (c.column_name || '').toLowerCase() ||
                        (value || '').toLowerCase() === (c.title || '').toLowerCase()),
                  )
                ) {
                  return reject(new Error('Duplicate column name'))
                }
                resolve()
              })
            },
          },
        ],
        uidt: [
          {
            required: true,
            message: 'UI Datatype is required',
          },
        ],
        ...(additionalValidations?.value || {}),
      }
    })

    const { resetFields, validate, validateInfos } = useForm(formState, validators)

    const setAdditionalValidations = (validations: Record<string, any>) => {
      additionalValidations.value = validations
    }

    // actions
    const generateNewColumnMeta = () => {
      setAdditionalValidations({})
      formState.value = { meta: {}, ...sqlUi.value.getNewColumn((meta.value?.columns?.length || 0) + 1) }
      formState.value.title = formState.value.title || formState.value.column_name
    }

    const onUidtOrIdTypeChange = () => {
      const { isCurrency } = useColumn(ref(formState.value as ColumnType))

      const colProp = sqlUi?.value.getDataTypeForUiType(formState?.value as any, idType as any)
      formState.value = {
        ...formState.value,
        meta: {},
        rqd: false,
        pk: false,
        ai: false,
        cdf: null,
        un: false,
        dtx: 'specificType',
        ...colProp,
      }

      formState.value.dtxp = sqlUi.value.getDefaultLengthForDatatype(formState.value.dt)
      formState.value.dtxs = sqlUi.value.getDefaultScaleForDatatype(formState.value.dt)

      const selectTypes = [UITypes.MultiSelect, UITypes.SingleSelect]
      if (column && selectTypes.includes(formState.value.uidt) && selectTypes.includes(column?.value?.uidt as UITypes)) {
        formState.value.dtxp = column?.value?.dtxp
      }

      if (columnToValidate.includes(formState.value.uidt)) {
        formState.value.meta = {
          validate: formState.value.meta && formState.value.meta.validate,
        }
      }

      if (isCurrency) {
        if (column?.value?.uidt === UITypes.Currency) {
          formState.value.dtxp = column.value.dtxp
          formState.value.dtxs = column.value.dtxs
        } else {
          formState.value.dtxp = 19
          formState.value.dtxs = 2
        }
      }

      formState.value.altered = formState.value.altered || 2
    }

    const onDataTypeChange = () => {
      const { isCurrency } = useColumn(ref(formState.value as ColumnType))

      formState.value.rqd = false
      if (formState.value.uidt !== UITypes.ID) {
        formState.value.primaryKey = false
      }
      formState.value.ai = false
      formState.value.cdf = null
      formState.value.un = false
      formState.value.dtxp = sqlUi.value.getDefaultLengthForDatatype(formState.value.dt)
      formState.value.dtxs = sqlUi.value.getDefaultScaleForDatatype(formState.value.dt)

      formState.value.dtx = 'specificType'

      const selectTypes = [UITypes.MultiSelect, UITypes.SingleSelect]
      if (column?.value && selectTypes.includes(formState.value.uidt) && selectTypes.includes(column?.value.uidt as UITypes)) {
        formState.value.dtxp = column?.value.dtxp
      }

      if (isCurrency) {
        if (column?.value?.uidt === UITypes.Currency) {
          formState.value.dtxp = column.value.dtxp
          formState.value.dtxs = column.value.dtxs
        } else {
          formState.value.dtxp = 19
          formState.value.dtxs = 2
        }
      }

      // this.$set(formState.value, 'uidt', sqlUi.value.getUIType(formState.value));

      formState.value.altered = formState.value.altered || 2
    }

    // todo: type of onAlter is wrong, the first argument is `CheckboxChangeEvent` not a number.
    const onAlter = (val = 2, cdf = false) => {
      formState.value.altered = formState.value.altered || val
      if (cdf) formState.value.cdf = formState.value.cdf || null
    }

    const addOrUpdate = async (onSuccess: () => void) => {
      try {
        console.log(formState, validators)
        if (!(await validate())) return
      } catch (e) {
        notification.error({
          message: 'Form validation failed',
        })
        return
      }

      try {
        formState.value.table_name = meta.value.table_name
        // formState.value.title = formState.value.column_name
        if (column?.value) {
          await $api.dbTableColumn.update(column?.value?.id as string, formState.value)
          notification.success({
            message: 'Column updated',
          })
        } else {
          // todo : set additional meta for auto generated string id
          if (formState.value.uidt === UITypes.ID) {
            // based on id column type set autogenerated meta prop
            // if (isAutoGenId) {
            //   this.newColumn.meta = {
            //     ag: 'nc',
            //   };
            // }
          }
          await $api.dbTableColumn.create(meta.value.id as string, formState.value)

          /** if LTAR column then force reload related table meta */
          if (formState.value.uidt === UITypes.LinkToAnotherRecord && meta.value.id !== formState.value.childId) {
            getMeta(formState.value.childId, true).then(() => {})
          }

          notification.success({
            message: 'Column created',
          })
        }
        onSuccess?.()
      } catch (e: any) {
        notification.error({
          message: await extractSdkResponseErrorMsg(e),
        })
      }
    }

    /** set column name same as title which is actual name in db */
    watch(
      () => formState.value?.title,
      (newTitle) => (formState.value.column_name = newTitle),
    )

    return {
      formState,
      resetFields,
      validate,
      validateInfos,
      setAdditionalValidations,
      onUidtOrIdTypeChange,
      sqlUi,
      onDataTypeChange,
      onAlter,
      addOrUpdate,
      generateNewColumnMeta,
      isEdit: computed(() => !!column?.value?.id),
      column,
    }
  },
)

export { useProvideColumnCreateStore }

export function useColumnCreateStoreOrThrow() {
  const columnCreateStore = useColumnCreateStore()
  if (columnCreateStore == null) throw new Error('Please call `useColumnCreateStore` on the appropriate parent component')
  return columnCreateStore
}