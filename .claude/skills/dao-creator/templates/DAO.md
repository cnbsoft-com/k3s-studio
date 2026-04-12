## DAO file template
```java
package xxx.xxx.xxx;

@Mapper
public interface <FILE_NAME>DAO {

  @Select(
    """
      select * from TABLE_NAME
      """
  )
  List<DTO> select(String id);

}
```